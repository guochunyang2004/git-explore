//! Git 单库命令（附录 B.2）

use crate::infra::error::AppResult;
use crate::AppState;
use crate::types::{Branch, CommitRef, DiffContent, FileStatus};
use crate::events::{event_name, GitProgressPayload};
use tauri::{Emitter, State};

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

#[tauri::command]
pub async fn git_clone(
    url: String,
    dest: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let git_service = state.git_service.clone();
    let app_handle = app.clone();

    let dest_path = dest.clone();
    let _result = tokio::task::spawn_blocking(move || {
        git_service.clone_repo(&url, &dest_path, &mut |stage: &str, percent: u8| {
            let _ = app_handle.emit(
                event_name::GIT_PROGRESS,
                GitProgressPayload {
                    repo_path: dest_path.clone(),
                    stage: stage.to_string(),
                    percent,
                },
            );
        })
    })
    .await
    .map_err(|e| {
        crate::infra::error::AppError::new(
            crate::infra::error::ErrorCode::GitError,
            "errors.git.clone",
            &format!("克隆任务失败: {e}"),
        )
    })??;

    Ok(dest)
}

#[tauri::command]
pub async fn git_pull(
    repo_path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let git_service = state.git_service.clone();
    let app_handle = app.clone();
    let rp = repo_path.clone();

    tokio::task::spawn_blocking(move || {
        git_service.pull(&repo_path, &mut |stage: &str, percent: u8| {
            let _ = app_handle.emit(
                event_name::GIT_PROGRESS,
                GitProgressPayload {
                    repo_path: rp.clone(),
                    stage: stage.to_string(),
                    percent,
                },
            );
        })
    })
    .await
    .map_err(|e| {
        crate::infra::error::AppError::new(
            crate::infra::error::ErrorCode::GitError,
            "errors.git.pull",
            &format!("拉取任务失败: {e}"),
        )
    })??;

    Ok(())
}

#[tauri::command]
pub async fn git_push(
    repo_path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let git_service = state.git_service.clone();
    let app_handle = app.clone();
    let rp = repo_path.clone();

    tokio::task::spawn_blocking(move || {
        git_service.push(&repo_path, &mut |stage: &str, percent: u8| {
            let _ = app_handle.emit(
                event_name::GIT_PROGRESS,
                GitProgressPayload {
                    repo_path: rp.clone(),
                    stage: stage.to_string(),
                    percent,
                },
            );
        })
    })
    .await
    .map_err(|e| {
        crate::infra::error::AppError::new(
            crate::infra::error::ErrorCode::GitError,
            "errors.git.push",
            &format!("推送任务失败: {e}"),
        )
    })??;

    Ok(())
}

#[tauri::command]
pub async fn git_commit(
    repo_path: String,
    message: String,
    file_paths: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<CommitRef> {
    let git_service = state.git_service.clone();
    let result = tokio::task::spawn_blocking(move || {
        git_service.commit(&repo_path, &message, &file_paths)
    })
    .await
    .map_err(|e| {
        crate::infra::error::AppError::new(
            crate::infra::error::ErrorCode::GitError,
            "errors.git.commit",
            &format!("提交任务失败: {e}"),
        )
    })??;

    Ok(result)
}

#[tauri::command]
pub fn git_diff(
    repo_path: String,
    file_path: String,
    state: State<'_, AppState>,
) -> AppResult<DiffContent> {
    state.git_service.diff(&repo_path, &file_path)
}
