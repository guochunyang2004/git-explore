//! Git 操作服务（对应架构文档 4.3）
//!
//! 封装全部 git 操作，领域层通过此服务调用 git2 和 OS git。

use crate::infra::error::AppResult;
use crate::infra::git2_adapter::{Git2Adapter, GitOps};
use crate::types::{Branch, CommitRef, FileStatus};
use std::sync::Arc;

pub struct GitService {
    adapter: Arc<dyn GitOps>,
}

impl GitService {
    pub fn new() -> Self {
        Self { adapter: Arc::new(Git2Adapter::new()) }
    }

    /// 获取底层适配器引用（供 BatchOpsManager 等使用）
    pub fn adapter(&self) -> Arc<dyn GitOps> {
        self.adapter.clone()
    }

    pub fn status(&self, repo_path: &str) -> AppResult<Vec<FileStatus>> {
        self.adapter.status(repo_path)
    }

    pub fn log(&self, repo_path: &str, branch: Option<&str>, page: u32, page_size: u32) -> AppResult<Vec<CommitRef>> {
        self.adapter.log(repo_path, branch, page, page_size)
    }

    pub fn branches(&self, repo_path: &str) -> AppResult<Vec<Branch>> {
        self.adapter.branches(repo_path)
    }

    pub fn checkout(&self, repo_path: &str, branch: &str) -> AppResult<()> {
        self.adapter.checkout(repo_path, branch)
    }

    pub fn commit(&self, repo_path: &str, message: &str, file_paths: &[String]) -> AppResult<CommitRef> {
        self.adapter.commit(repo_path, message, file_paths)
    }

    pub fn fetch(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
        self.adapter.fetch(repo_path, progress)
    }

    pub fn pull(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
        self.adapter.pull(repo_path, progress)
    }

    pub fn push(&self, repo_path: &str, progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
        self.adapter.push(repo_path, progress)
    }
}

impl Default for GitService {
    fn default() -> Self { Self::new() }
}
