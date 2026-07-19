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
    pub const GIT_SCAN_PROGRESS: &str = "git:scan-progress";
    pub const GIT_REPO_FOUND: &str = "git:repo-found";
    pub const SIZE_SCAN_STARTED: &str = "size:scan-started";
    pub const SIZE_SCAN_PROGRESS: &str = "size:scan-progress";
    pub const SIZE_ENTRY_UPDATED: &str = "size:entry-updated";
    pub const SIZE_SCAN_CANCELLED: &str = "size:scan-cancelled";
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

/// Git 扫描进度（实时上报）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitScanProgressPayload {
    pub root_path: String,
    /// 已扫描目录数
    pub scanned_dirs: u32,
    /// 已发现仓库数
    pub found_repos: u32,
    /// 当前正在扫描的目录路径
    pub current_dir: String,
}

/// 单个 Git 仓库被发现（实时上报）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoFoundPayload {
    pub repo: crate::types::GitRepoInfo,
}

/// 大小扫描开始
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeScanStartedPayload {
    pub root_path: String,
}

/// 大小扫描进度
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeScanProgressPayload {
    pub root_path: String,
    /// 已扫描目录数
    pub scanned_dirs: u32,
    /// 已扫描文件数
    pub scanned_files: u32,
    /// 当前正在扫描的目录
    pub current_dir: String,
}

/// 单个目录大小已算出（实时上报）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeEntryUpdatedPayload {
    /// 目录路径
    pub path: String,
    /// 总大小（字节）
    pub size: u64,
    /// 子文件数
    pub file_count: u32,
    /// 子目录数（递归）
    pub dir_count: u32,
}

/// 大小扫描取消/完成
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeScanCancelledPayload {
    pub root_path: String,
    pub scanned: u32,
}
