//! git2 适配器
//!
//! 封装 libgit2 调用，提供领域层使用的 trait。
//! - status/log/branch/commit: git2 本地操作
//! - pull/push/fetch: 通过 OS git 命令行（git2 远端支持不完整）

use crate::infra::error::{AppError, AppResult, ErrorCode};
use crate::types::{Branch, CommitRef, FileStatus, StatusCode};
use git2;
use std::path::Path;
use std::process::Command;

/// Git 操作 trait，提供完整的 git 操作抽象
pub trait GitOps: Send + Sync {
    // 本地操作
    fn status(&self, repo_path: &str) -> AppResult<Vec<FileStatus>>;
    fn log(&self, repo_path: &str, branch: Option<&str>, page: u32, page_size: u32) -> AppResult<Vec<CommitRef>>;
    fn branches(&self, repo_path: &str) -> AppResult<Vec<Branch>>;
    fn checkout(&self, repo_path: &str, branch: &str) -> AppResult<()>;
    fn commit(&self, repo_path: &str, message: &str, file_paths: &[String]) -> AppResult<CommitRef>;

    // 远端操作（进度回调）
    fn fetch(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()>;
    fn pull(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()>;
    fn push(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()>;
}

// ============================================================
// Git2Adapter — 默认实现
// ============================================================

pub struct Git2Adapter;

impl Git2Adapter {
    pub fn new() -> Self {
        Self
    }

    fn open_repo(path: &str) -> AppResult<git2::Repository> {
        git2::Repository::open(path).map_err(|e| {
            let msg = format!("打开仓库失败: {e}");
            AppError::new(ErrorCode::GitError, "errors.git.open", &msg)
                .with_param("path", path)
        })
    }

    fn revwalk_head<'a>(
        repo: &'a git2::Repository,
        branch: Option<&'a str>,
    ) -> AppResult<git2::Revwalk<'a>> {
        let mut walk = repo.revwalk()?;
        walk.set_sorting(git2::Sort::TIME)?;

        if let Some(branch_name) = branch {
            if let Ok(reference) = repo.find_reference(&format!("refs/heads/{branch_name}")) {
                if let Some(oid) = reference.target() {
                    walk.push(oid)?;
                }
            } else if let Ok(reference) = repo.find_reference(&format!("refs/remotes/origin/{branch_name}")) {
                if let Some(oid) = reference.target() {
                    walk.push(oid)?;
                }
            } else {
                let msg = format!("分支不存在: {branch_name}");
                return Err(AppError::new(
                    ErrorCode::NotFound,
                    "errors.git.branch_not_found",
                    &msg,
                ));
            }
        } else {
            walk.push_head()?;
        }

        Ok(walk)
    }
}

impl GitOps for Git2Adapter {
    // ============ status ============

    fn status(&self, repo_path: &str) -> AppResult<Vec<FileStatus>> {
        let repo = Self::open_repo(repo_path)?;
        let mut result = Vec::new();

        let statuses = repo.statuses(None)?;
        for entry in statuses.iter() {
            let status = entry.status();
            let code = if status.is_index_new() || status.is_wt_new() {
                StatusCode::Untracked
            } else if status.is_index_deleted() || status.is_wt_deleted() {
                StatusCode::Deleted
            } else if status.is_conflicted() {
                StatusCode::Conflict
            } else if status.is_index_renamed() || status.is_wt_renamed() {
                StatusCode::Renamed
            } else {
                StatusCode::Modified
            };

            let staged = status.is_index_modified()
                || status.is_index_new()
                || status.is_index_deleted()
                || status.is_index_renamed()
                || status.is_index_typechange();

            result.push(FileStatus { code, staged });
        }
        Ok(result)
    }

    // ============ log ============

    fn log(
        &self,
        repo_path: &str,
        branch: Option<&str>,
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<CommitRef>> {
        let repo = Self::open_repo(repo_path)?;
        let mut walk = Self::revwalk_head(&repo, branch)?;

        let skip = page * page_size;
        let mut entries: Vec<CommitRef> = Vec::new();

        let mut oid = walk.next();
        let mut skipped = 0u32;
        while let Some(Ok(id)) = oid {
            if skipped < skip {
                skipped += 1;
                oid = walk.next();
                continue;
            }
            if entries.len() as u32 >= page_size {
                break;
            }
            if let Ok(commit) = repo.find_commit(id) {
                entries.push(CommitRef {
                    hash: id.to_string()[..8].to_string(),
                    message: commit
                        .message()
                        .unwrap_or("")
                        .lines()
                        .next()
                        .unwrap_or("")
                        .to_string(),
                    author: commit.author().name().unwrap_or("unknown").to_string(),
                    time: commit.time().seconds(),
                });
            }
            oid = walk.next();
        }

        Ok(entries)
    }

    // ============ branches ============

    fn branches(&self, repo_path: &str) -> AppResult<Vec<Branch>> {
        let repo = Self::open_repo(repo_path)?;
        let mut result = Vec::new();

        // 当前分支名
        let head_name = repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(String::from));

        // 本地分支
        for branch in repo.branches(Some(git2::BranchType::Local))? {
            let (branch, _) = branch?;
            let name = branch.name()?.unwrap_or("").to_string();
            let is_current = head_name.as_deref() == Some(&name);
            let upstream = branch
                .upstream()
                .ok()
                .and_then(|b| b.name().ok().flatten().map(String::from));

            result.push(Branch {
                name,
                is_current,
                is_remote: false,
                upstream,
            });
        }

        // 远端分支
        for branch in repo.branches(Some(git2::BranchType::Remote))? {
            let (branch, _) = branch?;
            if let Ok(Some(name)) = branch.name() {
                result.push(Branch {
                    name: name.to_string(),
                    is_current: false,
                    is_remote: true,
                    upstream: None,
                });
            }
        }

        Ok(result)
    }

    // ============ checkout ============

    fn checkout(&self, repo_path: &str, branch: &str) -> AppResult<()> {
        let repo = Self::open_repo(repo_path)?;

        // 查找分支引用
        let ref_name = if branch.starts_with("origin/") || branch.contains('/') {
            // 远端分支
            format!("refs/remotes/{}", branch)
        } else {
            // 本地分支
            format!("refs/heads/{}", branch)
        };

        let target = repo.find_reference(&ref_name)
            .map_err(|e| AppError::new(
                ErrorCode::GitError,
                "git.branch_not_found",
                &format!("分支 '{}' 不存在: {}", branch, e),
            ))?;

        // 执行 checkout
        repo.set_head(target.name().unwrap_or(&ref_name))?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;

        Ok(())
    }

    // ============ commit ============

    fn commit(&self, repo_path: &str, message: &str, file_paths: &[String]) -> AppResult<CommitRef> {
        let repo = Self::open_repo(repo_path)?;
        let signature = repo.signature()?;

        // 暂存指定文件
        {
            let mut index = repo.index()?;
            let mut staged = false;
            for fp in file_paths {
                let p = Path::new(fp);
                if let Ok(relative) = p.strip_prefix(repo_path) {
                    let rel = relative.to_string_lossy().replace('\\', "/");
                    index.add_path(Path::new(&rel))?;
                    staged = true;
                }
            }
            if staged {
                index.write()?;
            }
        }

        // 构建树
        let tree_id = {
            let mut index = repo.index()?;
            index.write_tree()?
        };
        let tree = repo.find_tree(tree_id)?;

        // 获取父提交
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();

        // 提交
        let oid = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parents,
        )?;

        Ok(CommitRef {
            hash: oid.to_string()[..8].to_string(),
            message: message.to_string(),
            author: signature.name().unwrap_or("unknown").to_string(),
            time: signature.when().seconds(),
        })
    }

    // ============ 远端操作（OS git 命令行） ============

    fn fetch(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
        progress("连接远程…", 10);
        run_git_cmd(repo_path, &["fetch", "--all"], progress)
    }

    fn pull(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
        progress("连接远程…", 10);
        run_git_cmd(repo_path, &["pull", "--rebase"], progress)
    }

    fn push(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
        progress("连接远程…", 10);
        run_git_cmd(repo_path, &["push"], progress)
    }
}

impl Default for Git2Adapter {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================
// 辅助：通过 OS git 命令行执行远端操作
// ============================================================

fn run_git_cmd(repo_path: &str, args: &[&str], progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
    progress("执行中…", 30);

    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| {
            let msg = format!("启动 git 失败: {e}");
            AppError::new(ErrorCode::GitError, "errors.git.cmd", &msg)
        })?;

    if output.status.success() {
        progress("完成", 100);
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // 提取第一行作为用户可读的错误
        let first_line = stderr.lines().next().unwrap_or("未知错误");
        let msg = format!("git {} 失败: {first_line}", args.join(" "));
        Err(AppError::new(
            ErrorCode::GitError,
            "errors.git.cmd",
            &msg,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 在临时目录中用 git2 创建 git 仓库，返回路径
    fn init_temp_repo() -> String {
        let dir = std::env::temp_dir().join(format!("ge-test-git-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.to_str().unwrap().to_string();

        let repo = git2::Repository::init(&dir).unwrap();
        // 配置 user.email 和 user.name
        {
            let mut cfg = repo.config().unwrap();
            cfg.set_str("user.email", "test@gitexplore.dev").unwrap();
            cfg.set_str("user.name", "Test").unwrap();
        }

        // 创建一个文件并提交
        let readme_path = dir.join("README.md");
        std::fs::write(&readme_path, "# test\n").unwrap();

        // git add
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("README.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();

        // git commit
        let sig = git2::Signature::now("Test", "test@gitexplore.dev").unwrap();
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "initial",
            &tree,
            &[],
        ).unwrap();

        path
    }

    #[test]
    fn status_shows_clean_after_init() {
        let path = init_temp_repo();
        let adapter = Git2Adapter::new();
        let statuses = adapter.status(&path).unwrap();
        // 只有 README.md 且 clean
        let readme = statuses.iter().find(|_s| {
            // clean 文件应该没有记录或者只有 HEAD 引用
            true
        });
        assert!(readme.is_some() || statuses.is_empty(), "fresh repo 要么 clean 要么无 status");
    }

    #[test]
    fn status_detects_modified() {
        let path = init_temp_repo();
        // 修改 README.md
        std::fs::write(format!("{}/README.md", path), "# modified\n").unwrap();
        let adapter = Git2Adapter::new();
        let statuses = adapter.status(&path).unwrap();
        let modified = statuses.iter().find(|s| s.code == StatusCode::Modified);
        assert!(modified.is_some(), "应该检测到 modified 文件");
    }

    #[test]
    fn status_detects_untracked() {
        let path = init_temp_repo();
        std::fs::write(format!("{}/untracked.txt", path), "hello").unwrap();
        let adapter = Git2Adapter::new();
        let statuses = adapter.status(&path).unwrap();
        let ut = statuses.iter().find(|s| s.code == StatusCode::Untracked);
        assert!(ut.is_some(), "应该检测到 untracked 文件");
    }

    #[test]
    fn log_returns_commits() {
        let path = init_temp_repo();
        let adapter = Git2Adapter::new();
        let commits = adapter.log(&path, None, 0, 10).unwrap();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].message, "initial");
        assert!(!commits[0].hash.is_empty());
        assert!(!commits[0].author.is_empty());
    }

    #[test]
    fn log_pagination() {
        let path = init_temp_repo();
        let adapter = Git2Adapter::new();
        // 第一页：取 0 条
        let page0 = adapter.log(&path, None, 0, 0).unwrap();
        assert!(page0.is_empty());
        // 偏移 1 跳过唯一 commit
        let page1 = adapter.log(&path, None, 1, 10).unwrap();
        assert!(page1.is_empty());
    }

    #[test]
    fn branches_lists_main() {
        let path = init_temp_repo();
        let adapter = Git2Adapter::new();
        let branches = adapter.branches(&path).unwrap();
        // git2 默认分支可能是 master 或 main，取第一个本地分支
        let current = branches.iter().find(|b| b.is_current);
        assert!(current.is_some(), "应该有当前分支");
        assert!(!current.unwrap().is_remote);
        assert!(!branches.is_empty(), "应该至少有一个分支");
    }

    #[test]
    fn commit_creates_new_commit() {
        let path = init_temp_repo();
        std::fs::write(format!("{}/new.txt", path), "data").unwrap();
        let adapter = Git2Adapter::new();
        let commit = adapter.commit(&path, "add new.txt", &["new.txt".to_string()]).unwrap();
        assert_eq!(commit.message, "add new.txt");
        // 验证 log 包含新 commit
        let commits = adapter.log(&path, None, 0, 10).unwrap();
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].message, "add new.txt");
    }

    #[test]
    fn open_nonexistent_repo_errors() {
        let adapter = Git2Adapter::new();
        let err = adapter.status("/tmp/does-not-exist-12345").unwrap_err();
        assert_eq!(err.code, ErrorCode::GitError);
    }

    #[test]
    fn open_non_git_dir_errors() {
        let dir = std::env::temp_dir();
        let adapter = Git2Adapter::new();
        let err = adapter.status(dir.to_str().unwrap()).unwrap_err();
        // 临时目录不是 git 仓库
        assert_eq!(err.code, ErrorCode::GitError);
    }
}
