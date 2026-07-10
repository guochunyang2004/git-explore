//! 事件定义（对应架构文档 5.4 事件清单）
//!
//! 后端 → 前端事件，通过 app.emit 发送。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 事件名常量，前端监听时引用，避免拼写错误
pub mod event_name {
    pub const GIT_REPOS_DETECTED: &str = "git:repos-detected";
    pub const FS_CHANGED: &str = "fs:changed";
    pub const GIT_STATUS_CHANGED: &str = "git:status-changed";
    pub const GIT_PROGRESS: &str = "git:progress";
    pub const GIT_CONFLICT: &str = "git:conflict";
    pub const GIT_REPO_ADDED: &str = "git:repo-added";
    pub const GIT_REPO_REMOVED: &str = "git:repo-removed";
    pub const BATCH_STARTED: &str = "batch:started";
    pub const BATCH_REPO_PROGRESS: &str = "batch:repo-progress";
    pub const BATCH_REPO_DONE: &str = "batch:repo-done";
    pub const BATCH_COMPLETED: &str = "batch:completed";
    pub const AUTH_REQUIRED: &str = "auth:required";
    pub const GIT_SCAN_STARTED: &str = "git:scan-started";
    pub const GIT_SCAN_CANCELLED: &str = "git:scan-cancelled";
}

/// 识别到 git 仓库时回传的数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReposDetectedPayload {
    pub repos: Vec<crate::types::GitRepoInfo>,
}

/// 单库进度
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProgressPayload {
    pub repo_path: String,
    pub stage: String,
    pub percent: u8,
}

/// 批量操作启动
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchStartedPayload {
    pub batch_id: String,
    pub op: crate::types::BatchOp,
    pub total: u32,
}

/// 批量单仓进度
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRepoProgressPayload {
    pub batch_id: String,
    pub repo_path: String,
    pub stage: String,
    pub percent: u8,
}

/// 批量单仓完成
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRepoDonePayload {
    pub batch_id: String,
    pub repo_path: String,
    pub success: bool,
    pub message: String,
}

/// 批量完成
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCompletedPayload {
    pub batch_id: String,
    pub summary: BatchSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSummary {
    pub success: u32,
    pub failed: u32,
    pub skipped: u32,
    pub conflict: u32,
}

/// 认证请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRequiredPayload {
    pub host: String,
    pub repo_path: String,
}

/// 文件系统变更
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChangedPayload {
    pub path: String,
    pub kind: String,
}

/// i18n 插值参数
pub type I18nParams = HashMap<String, String>;

/// Git 扫描开始
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitScanStartedPayload {
    pub root_path: String,
}

/// Git 扫描取消/完成
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitScanCancelledPayload {
    pub root_path: String,
    pub found: usize,
}
