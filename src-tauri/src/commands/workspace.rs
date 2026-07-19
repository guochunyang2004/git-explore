//! 工作区命令（附录 B.1）

use crate::infra::error::AppResult;
use crate::AppState;
use crate::types::{FileEntry, ListResult};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

/// 磁盘信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    /// 盘符根路径，如 `C:\`
    pub path: String,
    /// 显示名称，如 `本地磁盘 (C:)`
    pub name: String,
}

/// 列出本机所有磁盘根目录
#[tauri::command]
pub fn list_drives() -> AppResult<Vec<DriveInfo>> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Windows: 遍历 A-Z 盘符，用 GetDriveTypeW 判断是否存在
        use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetVolumeInformationW};

        for c in b'A'..=b'Z' {
            let root: Vec<u16> = [c as u16, b':' as u16, b'\\' as u16, 0].to_vec();
            let root_path = String::from_utf16_lossy(&root[..3]);
            let root_wide: Vec<u16> = root.clone();

            let drive_type = unsafe { GetDriveTypeW(windows::core::PCWSTR(root_wide.as_ptr())) };
            // DRIVE_FIXED=3, DRIVE_REMOVABLE=2, DRIVE_REMOTE=4, DRIVE_RAMDISK=6
            if drive_type == 3 || drive_type == 2 || drive_type == 4 || drive_type == 6 {
                // 获取卷标名
                let mut vol_name_buf = [0u16; 260];
                let ok = unsafe {
                    GetVolumeInformationW(
                        windows::core::PCWSTR(root_wide.as_ptr()),
                        Some(&mut vol_name_buf),
                        None,
                        None,
                        None,
                        None,
                    )
                };
                let vol_label = if ok.is_ok() {
                    let len = vol_name_buf.iter().position(|&c| c == 0).unwrap_or(0);
                    String::from_utf16_lossy(&vol_name_buf[..len])
                } else {
                    String::new()
                };

                let display_name = if vol_label.is_empty() {
                    format!("本地磁盘 ({}:)", c as char)
                } else {
                    format!("{} ({}:)", vol_label, c as char)
                };

                drives.push(DriveInfo {
                    path: root_path,
                    name: display_name,
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: / 和 /Volumes/* 下的挂载点
        drives.push(DriveInfo {
            path: "/".to_string(),
            name: "Macintosh HD".to_string(),
        });
        if let Ok(entries) = std::fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name != "Macintosh HD" && !name.starts_with('.') {
                    drives.push(DriveInfo {
                        path: format!("/Volumes/{}", name),
                        name,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: / 和 /media/*, /mnt/* 下的挂载点
        drives.push(DriveInfo {
            path: "/".to_string(),
            name: "Root".to_string(),
        });
        for base in ["/media", "/mnt"] {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') {
                        drives.push(DriveInfo {
                            path: format!("{}/{}", base, name),
                            name,
                        });
                    }
                }
            }
        }
    }

    Ok(drives)
}

/// 打开根目录，返回首层条目，后台异步触发 git 扫描
#[tauri::command]
pub fn workspace_open(
    root_path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<FileEntry>> {
    let entries = state.workspace.open(&root_path)?;

    // 记录最近打开
    let _ = state.config.add_recent_root_and_save(&root_path);

    // 后台异步扫描 git 仓库
    let detector = state.git_detector.clone();
    let cfg_snapshot = state.config.get();
    let depth = cfg_snapshot.preferences.scan_depth as usize;
    let root = std::path::PathBuf::from(root_path);
    tauri::async_runtime::spawn(async move {
        // 发射扫描开始事件
        let _ = app.emit(
            crate::events::event_name::GIT_SCAN_STARTED,
            crate::events::GitScanStartedPayload {
                root_path: root.to_string_lossy().to_string(),
            },
        );
        let cancel_flag = std::sync::atomic::AtomicBool::new(false);
        match detector.scan_with_cancel(&root, depth, &cancel_flag, Some(app.clone())) {
            Ok(repos) => {
                let _ = app.emit(
                    crate::events::event_name::GIT_REPOS_DETECTED,
                    crate::events::ReposDetectedPayload { repos },
                );
            }
            Err(e) => tracing::error!("git 扫描失败: {:?}", e),
        }
    });

    Ok(entries)
}

/// 列目录，自动推导 git 上下文
#[tauri::command]
pub fn workspace_list(dir_path: String, state: State<'_, AppState>) -> AppResult<ListResult> {
    let mut result = state.workspace.list(&dir_path)?;

    // 推导 git 上下文
    let path = std::path::PathBuf::from(&dir_path);
    if let Some(repo_info) = state.git_detector.context_of(&path) {
        result.git_context = Some(crate::types::GitContext {
            repo_path: repo_info.path,
            repo_name: repo_info.name,
            branch: repo_info.branch,
        });
    }
    Ok(result)
}

/// 最近打开的根目录列表
#[tauri::command]
pub fn workspace_recent(state: State<'_, AppState>) -> Vec<String> {
    state.config.get().recent_roots.clone()
}

/// 获取默认工作区路径（用户文档目录）
#[tauri::command]
pub fn get_default_workspace() -> AppResult<String> {
    let dir = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| {
            crate::infra::error::AppError::new(
                crate::infra::error::ErrorCode::NotFound,
                "errors.not_found",
                "无法确定用户文档目录",
            )
        })?;
    Ok(dir.to_string_lossy().to_string())
}

/// 懒加载子目录（树展开）
#[tauri::command]
pub fn workspace_tree_expand(dir_path: String, state: State<'_, AppState>) -> AppResult<Vec<FileEntry>> {
    state.workspace.tree_expand(&dir_path)
}

/// 扫描指定目录及其子目录中的 Git 仓库
/// 在后台异步执行，通过 `git:repos-detected` 事件回传结果
/// 可通过 `scan_cancel` 命令取消
#[tauri::command]
pub fn scan_git_repos(
    root_path: String,
    depth: Option<usize>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    // 重置取消令牌
    state.scan_cancel.store(false, Ordering::SeqCst);

    let detector = state.git_detector.clone();
    let cancel_flag = state.scan_cancel.clone();
    let cfg_snapshot = state.config.get();
    let scan_depth = depth.unwrap_or(cfg_snapshot.preferences.scan_depth as usize);
    let root = std::path::PathBuf::from(root_path);

    tauri::async_runtime::spawn(async move {
        // 发射扫描开始事件
        let _ = app.emit(
            crate::events::event_name::GIT_SCAN_STARTED,
            crate::events::GitScanStartedPayload {
                root_path: root.to_string_lossy().to_string(),
            },
        );

        match detector.scan_with_cancel(&root, scan_depth, &cancel_flag, Some(app.clone())) {
            Ok(repos) => {
                if cancel_flag.load(Ordering::SeqCst) {
                    let _ = app.emit(
                        crate::events::event_name::GIT_SCAN_CANCELLED,
                        crate::events::GitScanCancelledPayload {
                            root_path: root.to_string_lossy().to_string(),
                            found: repos.len(),
                        },
                    );
                } else {
                    let _ = app.emit(
                        crate::events::event_name::GIT_REPOS_DETECTED,
                        crate::events::ReposDetectedPayload { repos },
                    );
                }
            }
            Err(e) => {
                tracing::error!("git 扫描失败: {:?}", e);
                let _ = app.emit(
                    crate::events::event_name::GIT_SCAN_CANCELLED,
                    crate::events::GitScanCancelledPayload {
                        root_path: root.to_string_lossy().to_string(),
                        found: 0,
                    },
                );
            }
        }
    });

    Ok(())
}

/// 取消正在进行的 Git 扫描
#[tauri::command]
pub fn scan_cancel(state: State<'_, AppState>) {
    state.scan_cancel.store(true, Ordering::SeqCst);
    tracing::info!("用户取消 Git 扫描");
}
