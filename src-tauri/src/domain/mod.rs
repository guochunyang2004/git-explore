//! 领域层
//!
//! 核心业务逻辑，与 Tauri 解耦，可独立单测。

pub mod batch_ops_manager;
pub mod git_detector;
pub mod git_service;
pub mod status_aggregator;
pub mod workspace_manager;

pub use batch_ops_manager::BatchOpsManager;
pub use git_detector::GitDetector;
pub use git_service::GitService;
pub use workspace_manager::WorkspaceManager;
