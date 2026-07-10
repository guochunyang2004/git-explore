//! Git 自动识别器（对应架构文档 4.2）⭐ 核心
//!
//! 扫描目录树，识别含 .git 的目录，维护"git 仓库地图"。

use crate::infra::error::AppResult;
use crate::types::GitRepoInfo;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use walkdir::WalkDir;

pub struct GitDetector {
    repos: RwLock<HashMap<String, GitRepoInfo>>,
}

impl GitDetector {
    pub fn new() -> Self {
        Self { repos: RwLock::new(HashMap::new()) }
    }

    /// 扫描根目录下指定深度，识别所有 git 仓库
    pub fn scan(&self, root: &Path, depth: usize) -> AppResult<Vec<GitRepoInfo>> {
        self.scan_with_cancel(root, depth, &std::sync::atomic::AtomicBool::new(false))
    }

    /// 扫描根目录下指定深度，支持取消令牌
    pub fn scan_with_cancel(
        &self,
        root: &Path,
        depth: usize,
        cancel_flag: &std::sync::atomic::AtomicBool,
    ) -> AppResult<Vec<GitRepoInfo>> {
        use std::sync::atomic::Ordering;
        let mut found = Vec::new();
        for entry in WalkDir::new(root)
            .max_depth(depth)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if cancel_flag.load(Ordering::SeqCst) {
                tracing::info!("扫描被用户取消");
                break;
            }
            if !entry.file_type().is_dir() {
                continue;
            }
            let path = entry.path();
            // 跳过 node_modules、.git 内部目录等常见噪音
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if name == "node_modules" || name == ".git" || name == "target" || name == "__pycache__" {
                continue;
            }
            if path.join(".git").exists() {
                if let Ok(info) = Self::read_repo_info(path) {
                    found.push(info);
                }
            }
        }
        {
            let mut repos = self.repos.write().unwrap();
            for info in &found {
                repos.insert(info.path.clone(), info.clone());
            }
        }
        tracing::info!("扫描完成，识别到 {} 个 git 仓库", found.len());
        Ok(found)
    }

    /// 推导指定路径所属的 git 仓库（向上查找最近的）
    pub fn context_of(&self, path: &Path) -> Option<GitRepoInfo> {
        let repos = self.repos.read().unwrap();
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let mut best: Option<GitRepoInfo> = None;
        let mut best_len = 0;
        for (repo_path, info) in repos.iter() {
            if canonical.starts_with(PathBuf::from(repo_path)) && repo_path.len() > best_len {
                best_len = repo_path.len();
                best = Some(info.clone());
            }
        }
        best
    }

    pub fn all_repos(&self) -> Vec<GitRepoInfo> {
        self.repos.read().unwrap().values().cloned().collect()
    }

    pub fn get_repo(&self, path: &str) -> Option<GitRepoInfo> {
        self.repos.read().unwrap().get(path).cloned()
    }

    pub fn upsert(&self, info: GitRepoInfo) {
        self.repos.write().unwrap().insert(info.path.clone(), info);
    }

    pub fn remove(&self, path: &str) {
        self.repos.write().unwrap().remove(path);
    }

    fn read_repo_info(path: &Path) -> AppResult<GitRepoInfo> {
        let repo = git2::Repository::open(path)?;
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let branch = repo.head().ok().and_then(|h| h.shorthand().map(|s| s.to_string())).unwrap_or_else(|| "HEAD".to_string());
        let head_short = repo.head().ok().and_then(|h| h.target().map(|t| t.to_string())).map(|s: String| s.chars().take(7).collect()).unwrap_or_default();
        let remote_url = repo.find_remote("origin").ok().and_then(|r| r.url().map(|s| s.to_string()));
        let (ahead, behind, has_upstream) = compute_ahead_behind(&repo, &branch);
        let dirty_count = count_dirty(&repo);
        let is_clean = dirty_count == 0 && ahead == 0 && behind == 0;
        let last_commit_msg = repo.head().ok().and_then(|h| h.peel_to_commit().ok()).and_then(|c| c.summary().map(|s| s.to_string())).unwrap_or_default();
        let (last_commit_author, last_commit_time) = repo.head().ok()
            .and_then(|h| h.peel_to_commit().ok())
            .map(|c| (
                c.author().name().map(|s| s.to_string()).unwrap_or_default(),
                c.time().seconds(),
            ))
            .unwrap_or_default();
        Ok(GitRepoInfo {
            path: path.to_string_lossy().to_string(),
            name, branch, ahead, behind, dirty_count, is_clean, remote_url,
            has_upstream, head_short, is_submodule: false, last_commit_msg,
            last_commit_author, last_commit_time,
        })
    }
}

impl Default for GitDetector {
    fn default() -> Self { Self::new() }
}

/// 计算 ahead/behind
fn compute_ahead_behind(repo: &git2::Repository, branch: &str) -> (u32, u32, bool) {
    let head = match repo.head() { Ok(h) => h, Err(_) => return (0, 0, false) };
    let local_oid = match head.target() { Some(o) => o, None => return (0, 0, false) };
    let upstream_name = format!("origin/{}", branch);
    let up_oid = match repo.resolve_reference_from_short_name(&upstream_name) {
        Ok(r) => r.target(),
        Err(_) => return (0, 0, false),
    };
    match up_oid {
        Some(up) => match repo.graph_ahead_behind(local_oid, up) {
            Ok((a, b)) => (a as u32, b as u32, true),
            Err(_) => (0, 0, true),
        },
        None => (0, 0, false),
    }
}

/// 统计工作区+暂存区变更文件数
fn count_dirty(repo: &git2::Repository) -> u32 {
    let statuses = repo.statuses(None);
    match statuses {
        Ok(s) => s.iter().filter(|e| {
            let st = e.status();
            !st.is_empty()
                && !st.contains(git2::Status::IGNORED)
                && !st.is_ignored()
        }).count() as u32,
        Err(_) => 0,
    }
}
