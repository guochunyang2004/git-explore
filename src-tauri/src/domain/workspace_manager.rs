//! 工作区管理（对应架构文档 4.1）
//!
//! 管理当前打开的根目录、最近打开记录、文件树读取。

use crate::infra::error::{AppError, AppResult, ErrorCode};
use crate::types::{FileEntry, ListResult};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

pub struct WorkspaceManager {
    /// 当前打开的根目录
    root: RwLock<Option<PathBuf>>,
}

impl WorkspaceManager {
    pub fn new() -> Self {
        Self {
            root: RwLock::new(None),
        }
    }

    /// 打开根目录，返回首层文件条目
    pub fn open(&self, root_path: &str) -> AppResult<Vec<FileEntry>> {
        let path = PathBuf::from(root_path);
        if !path.exists() {
            return Err(AppError::new(
                ErrorCode::NotFound,
                "errors.not_found",
                "目录不存在",
            )
            .with_param("path", root_path));
        }
        if !path.is_dir() {
            return Err(AppError::new(
                ErrorCode::InvalidPath,
                "errors.invalid_path",
                "路径不是目录",
            )
            .with_param("path", root_path));
        }

        // 路径规范化
        let canonical = path.canonicalize().unwrap_or(path);
        let canonical = strip_verbatim_prefix(&canonical);
        *self.root.write().unwrap() = Some(canonical.clone());

        tracing::info!("打开工作区: {}", canonical.display());
        self.list_dir(&canonical, &canonical)
    }

    /// 列出指定目录内容，自动推导 git 上下文
    pub fn list(&self, dir_path: &str) -> AppResult<ListResult> {
        let path = PathBuf::from(dir_path);
        if !path.exists() {
            return Err(AppError::new(
                ErrorCode::NotFound,
                "errors.not_found",
                "目录不存在",
            )
            .with_param("path", dir_path));
        }

        let root = self.root.read().unwrap().clone();
        let entries = match &root {
            Some(r) => self.list_dir(&path, r)?,
            None => self.list_dir(&path, &path)?,
        };

        // git 上下文由 GitDetector 推导，此处暂返回 None
        Ok(ListResult {
            entries,
            git_context: None,
        })
    }

    /// 懒加载子目录（树展开）
    pub fn tree_expand(&self, dir_path: &str) -> AppResult<Vec<FileEntry>> {
        let path = PathBuf::from(dir_path);
        let root = self.root.read().unwrap().clone();
        match &root {
            Some(r) => self.list_dir(&path, r),
            None => self.list_dir(&path, &path),
        }
    }

    /// 获取当前根目录
    pub fn current_root(&self) -> Option<PathBuf> {
        self.root.read().unwrap().clone()
    }

    /// 列出目录条目（单层，不递归）
    fn list_dir(&self, dir: &Path, _root: &Path) -> AppResult<Vec<FileEntry>> {
        let mut entries = Vec::new();

        let read_dir = match std::fs::read_dir(dir) {
            Ok(rd) => rd,
            Err(e) => {
                return Err(AppError::from(e));
            }
        };

        for entry in read_dir.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();

            // 跳过隐藏文件（除了 .git 用于识别）
            if name.starts_with('.') && name != ".git" {
                continue;
            }

            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            entries.push(FileEntry {
                name: name.clone(),
                path: strip_verbatim_prefix(&entry.path()).to_string_lossy().to_string(),
                is_dir: meta.is_dir(),
                size: if meta.is_dir() { 0 } else { meta.len() },
                modified,
                git_status: None, // P4 阶段由 GitService 填充
                last_commit: None,
            });
        }

        // 排序：目录在前，名称升序
        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(entries)
    }
}

impl Default for WorkspaceManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 去除 Windows extended-length path 前缀 `\\?\`
/// canonicalize() 在 Windows 上会返回 `\\?\D:\...` 格式，
/// 需要去除前缀以正常显示
fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if s.starts_with(r"\\?\") {
        // 去掉 `\\?\` 前缀
        let stripped = &s[4..];
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let p = std::env::temp_dir().join(format!("ge-test-ws-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        // create some files
        std::fs::write(p.join("a.txt"), "aaa").unwrap();
        std::fs::create_dir(p.join("sub")).unwrap();
        std::fs::write(p.join("sub/b.txt"), "bbb").unwrap();
        // hidden file (should be skipped)
        std::fs::write(p.join(".hidden"), "x").unwrap();
        p
    }

    #[test]
    fn open_existing_dir() {
        let p = temp_dir();
        let mgr = WorkspaceManager::new();
        let entries = mgr.open(p.to_str().unwrap()).unwrap();
        assert!(entries.len() >= 2, "至少应该有 a.txt 和 sub/");
        let names: Vec<String> = entries.iter().map(|e| e.name.clone()).collect();
        assert!(names.contains(&"sub".to_string()), "应包含 sub");
        assert!(names.contains(&"a.txt".to_string()), "应包含 a.txt");
        assert!(!names.contains(&".hidden".to_string()), "不应包含 .hidden");
    }

    #[test]
    fn dirs_before_files() {
        let p = temp_dir();
        let mgr = WorkspaceManager::new();
        let entries = mgr.open(p.to_str().unwrap()).unwrap();
        // 验证目录排在文件前面
        let sub_idx = entries.iter().position(|e| e.name == "sub").unwrap();
        let txt_idx = entries.iter().position(|e| e.name == "a.txt").unwrap();
        assert!(sub_idx < txt_idx, "目录应排在文件前面");
    }

    #[test]
    fn entry_has_correct_properties() {
        let p = temp_dir();
        let mgr = WorkspaceManager::new();
        let entries = mgr.open(p.to_str().unwrap()).unwrap();
        let sub = entries.iter().find(|e| e.name == "sub").unwrap();
        assert!(sub.is_dir, "sub 是目录");
        assert_eq!(sub.size, 0, "目录 size 为 0");

        let txt = entries.iter().find(|e| e.name == "a.txt").unwrap();
        assert!(!txt.is_dir, "a.txt 不是目录");
        assert_eq!(txt.size, 3, "a.txt 大小为 3");
        assert!(txt.modified > 0, "应有修改时间");
        assert!(txt.git_status.is_none(), "git_status 应为 None");
        assert!(txt.last_commit.is_none());
    }

    #[test]
    fn open_nonexistent_dir_errors() {
        let mgr = WorkspaceManager::new();
        let err = mgr.open("/does/not/exist/path").unwrap_err();
        assert_eq!(err.code, ErrorCode::NotFound);
    }

    #[test]
    fn open_file_errors() {
        let p = temp_dir();
        let mgr = WorkspaceManager::new();
        let err = mgr.open(p.join("a.txt").to_str().unwrap()).unwrap_err();
        assert_eq!(err.code, ErrorCode::InvalidPath);
    }

    #[test]
    fn tree_expand_lists_subdir_contents() {
        let p = temp_dir();
        let mgr = WorkspaceManager::new();
        mgr.open(p.to_str().unwrap()).unwrap();
        let entries = mgr.tree_expand(p.join("sub").to_str().unwrap()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "b.txt");
    }

    #[test]
    fn current_root_tracks_opened_path() {
        let p = temp_dir();
        let mgr = WorkspaceManager::new();
        assert!(mgr.current_root().is_none());
        mgr.open(p.to_str().unwrap()).unwrap();
        let root = mgr.current_root().unwrap();
        assert!(root.to_str().unwrap().contains("ge-test-ws-"));
    }
}
