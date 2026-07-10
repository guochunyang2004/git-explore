//! 核心数据模型（对应架构文档附录 A）
//!
//! 前后端共享契约，Rust 端 serde 序列化，TS 端对应 interface。

use serde::{Deserialize, Serialize};

// ============ Git 仓库信息 (附录 A.1) ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoInfo {
    /// 仓库根绝对路径
    pub path: String,
    /// 目录名，用于展示
    pub name: String,
    /// 当前分支
    pub branch: String,
    /// 领先远端提交数
    pub ahead: u32,
    /// 落后远端提交数
    pub behind: u32,
    /// 工作区+暂存区变更文件数
    pub dirty_count: u32,
    /// 是否干净
    pub is_clean: bool,
    /// origin URL，无远端则 None
    pub remote_url: Option<String>,
    /// 当前分支是否跟踪远端
    pub has_upstream: bool,
    /// HEAD 短哈希
    pub head_short: String,
    /// 是否为 submodule
    pub is_submodule: bool,
    /// 最近一次提交信息摘要
    pub last_commit_msg: String,
    /// 最近一次提交者
    pub last_commit_author: String,
    /// 最近一次提交时间（Unix 时间戳）
    pub last_commit_time: i64,
}

// ============ 文件条目 (附录 A.2) ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    /// 相对根目录路径
    pub path: String,
    pub is_dir: bool,
    /// 文件字节数，目录为 0
    pub size: u64,
    /// Unix 时间戳
    pub modified: i64,
    /// 非 git 区域为 None
    pub git_status: Option<FileStatus>,
    /// 所属 git 仓库才有
    pub last_commit: Option<CommitRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRef {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub time: i64,
}

// ============ Git 状态标记 (附录 A.3) ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub code: StatusCode,
    pub staged: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StatusCode {
    Modified,
    Added,
    Deleted,
    Untracked,
    Conflict,
    Renamed,
}

// ============ 批量任务 (附录 A.4 / A.5) ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTask {
    pub id: String,
    pub repo_path: String,
    pub repo_name: String,
    pub branch: String,
    pub state: BatchState,
    /// 人类可读阶段，如 "接收对象中"
    pub stage: String,
    pub percent: u8,
    /// 完成时的结果/错误信息
    pub message: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BatchState {
    Queued,
    Running,
    Success,
    Failed,
    Skipped,
    Conflict,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub batch_id: String,
    pub op: BatchOp,
    pub total: u32,
    pub success: u32,
    pub failed: u32,
    pub skipped: u32,
    pub conflict: u32,
    pub tasks: Vec<BatchTask>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BatchOp {
    Pull,
    Push,
    Fetch,
    Sync,
    Commit,
    SwitchBranch,
}

// ============ Git 上下文 ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitContext {
    pub repo_path: String,
    pub repo_name: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListResult {
    pub entries: Vec<FileEntry>,
    pub git_context: Option<GitContext>,
}

// ============ 分支 ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub last_commit_author: Option<String>,
    pub last_commit_time: Option<i64>,
}
