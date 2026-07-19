//! GitExplore 后端库入口
//!
//! 架构分层：commands (应用层) → domain (领域层) → infra (基础设施层)
//! 详见 docs/architecture.md

pub mod commands;
pub mod domain;
pub mod events;
pub mod infra;
pub mod types;

use infra::config::ConfigManager;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;

/// 应用共享状态，通过 tauri State 注入
pub struct AppState {
    pub config: Arc<ConfigManager>,
    pub workspace: Arc<domain::WorkspaceManager>,
    pub git_detector: Arc<domain::GitDetector>,
    pub git_service: Arc<domain::GitService>,
    pub batch_ops: Arc<domain::BatchOpsManager>,
    /// 扫描取消令牌
    pub scan_cancel: Arc<AtomicBool>,
    /// 大小扫描取消令牌
    pub size_scan_cancel: Arc<AtomicBool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tracing::info!("GitExplore 启动中...");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 加载配置
            let config = Arc::new(ConfigManager::load()?);
            let workspace = Arc::new(domain::WorkspaceManager::new());
            let git_detector = Arc::new(domain::GitDetector::new());
            let git_service = Arc::new(domain::GitService::new());
            let batch_ops = Arc::new(domain::BatchOpsManager::new(git_service.adapter()));
            let scan_cancel = Arc::new(AtomicBool::new(false));
            let size_scan_cancel = Arc::new(AtomicBool::new(false));

            app.manage(AppState {
                config,
                workspace,
                git_detector,
                git_service,
                batch_ops,
                scan_cancel,
                size_scan_cancel,
            });

            tracing::info!("GitExplore 启动完成");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 工作区命令
            commands::workspace::workspace_open,
            commands::workspace::workspace_list,
            commands::workspace::workspace_recent,
            commands::workspace::workspace_tree_expand,
            commands::workspace::get_default_workspace,
            commands::workspace::list_drives,
            commands::workspace::scan_git_repos,
            commands::workspace::scan_cancel,
            // 大小扫描命令
            commands::size_scan::scan_dir_sizes,
            commands::size_scan::scan_size_cancel,
            // Git 单库命令
            commands::git::git_status,
            commands::git::git_log,
            commands::git::git_branches,
            commands::git::git_checkout,
            commands::git::git_clone,
            commands::git::git_pull,
            commands::git::git_push,
            commands::git::git_commit,
            commands::git::git_diff,
            commands::git::git_refresh_repo,
            // 文件/系统命令
            commands::fs::fs_open_external,
            commands::fs::fs_open_terminal,
            commands::fs::fs_ignore,
            // 配置命令
            commands::config::config_get,
            commands::config::config_save,
            // 批量命令
            commands::batch::batch_run,
            commands::batch::batch_cancel,
            commands::batch::batch_retry,
            commands::batch::batch_status,
        ])
        .run(tauri::generate_context!())
        .expect("运行 GitExplore 时发生错误");
}
