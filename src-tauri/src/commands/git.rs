//! Git 单库命令（附录 B.2）

use crate::infra::error::AppResult;
use crate::AppState;
use crate::types::{Branch, CommitRef, FileStatus};
use tauri::State;

#[tauri::command]
pub fn git_status(repo_path: String, state: State<'_, AppState>) -> AppResult<Vec<FileStatus>> {
    state.git_service.status(&repo_path)
}

#[tauri::command]
pub fn git_log(
    repo_path: String,
    branch: Option<String>,
    page: u32,
    page_size: u32,
    state: State<'_, AppState>,
) -> AppResult<Vec<CommitRef>> {
    state.git_service.log(&repo_path, branch.as_deref(), page, page_size)
}

#[tauri::command]
pub fn git_branches(repo_path: String, state: State<'_, AppState>) -> AppResult<Vec<Branch>> {
    state.git_service.branches(&repo_path)
}

#[tauri::command]
pub fn git_checkout(repo_path: String, branch: String, state: State<'_, AppState>) -> AppResult<()> {
    state.git_service.checkout(&repo_path, &branch)
}
