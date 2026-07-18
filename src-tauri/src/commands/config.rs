//! 配置命令（设置页面对应 IPC）
//! 
//! 提供配置读写、语言切换等接口。

use crate::AppState;
use crate::infra::error::AppResult;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub language: Option<String>,
    pub scan_depth: u32,
    pub batch_concurrency: u32,
    pub restore_last_root: bool,
    pub repo_color: String,
    pub auto_scan_git: bool,
}

/// 获取当前配置（用于设置页面初始化）
#[tauri::command]
pub fn config_get(state: State<'_, AppState>) -> SettingsDto {
    let cfg = state.config.get();
    SettingsDto {
        language: cfg.preferences.language,
        scan_depth: cfg.preferences.scan_depth,
        batch_concurrency: cfg.preferences.batch_concurrency,
        restore_last_root: cfg.preferences.restore_last_root,
        repo_color: cfg.preferences.repo_color,
        auto_scan_git: cfg.preferences.auto_scan_git,
    }
}

/// 保存设置
#[tauri::command]
pub fn config_save(settings: SettingsDto, state: State<'_, AppState>) -> AppResult<()> {
    state.config.set_language(settings.language);
    {
        let mut cfg = state.config.inner_lock();
        cfg.preferences.scan_depth = settings.scan_depth;
        cfg.preferences.batch_concurrency = settings.batch_concurrency;
        cfg.preferences.restore_last_root = settings.restore_last_root;
        cfg.preferences.repo_color = settings.repo_color;
        cfg.preferences.auto_scan_git = settings.auto_scan_git;
    }
    state.config.save()
}
