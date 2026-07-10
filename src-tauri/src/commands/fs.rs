//! 文件/系统命令（附录 B.4）

use crate::infra::error::{AppError, AppResult, ErrorCode};
use std::path::PathBuf;

/// 系统默认程序打开
#[tauri::command]
pub fn fs_open_external(path: String, _app: tauri::AppHandle) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::new(ErrorCode::NotFound, "errors.not_found", "路径不存在").with_param("path", &path));
    }
    // 跨平台打开
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&path).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
    }
    Ok(())
}

/// 在此路径打开终端
#[tauri::command]
pub fn fs_open_terminal(path: String, _app: tauri::AppHandle) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::new(ErrorCode::NotFound, "errors.not_found", "路径不存在").with_param("path", &path));
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "cmd", "/K", &format!("cd /d {}", path)])
            .spawn();
    }
    Ok(())
}

/// 追加到 .gitignore
#[tauri::command]
pub fn fs_ignore(repo_path: String, pattern: String) -> AppResult<()> {
    let ignore_path = PathBuf::from(&repo_path).join(".gitignore");
    let mut content = std::fs::read_to_string(&ignore_path).unwrap_or_default();
    if !content.ends_with('\n') && !content.is_empty() {
        content.push('\n');
    }
    content.push_str(&pattern);
    content.push('\n');
    std::fs::write(&ignore_path, content)?;
    Ok(())
}
