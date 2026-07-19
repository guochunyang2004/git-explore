//! 目录大小扫描命令
//!
//! 采用广度优先（BFS）策略：先扫描上层目录，再逐层深入子目录。
//! 这样上层目录的大小会更快显示在列表中。

use crate::infra::error::AppResult;
use crate::AppState;
use std::collections::VecDeque;
use std::path::Path;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

/// 去除 Windows extended-length path 前缀 `\\?\`，统一路径分隔符为 `\`
fn normalize_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    let stripped = if s.starts_with(r"\\?\") {
        &s[4..]
    } else {
        &s[..]
    };
    // 统一为反斜杠（Windows）
    stripped.replace('/', "\\")
}

/// 快速扫描目录的直接内容（不递归子目录）
/// 返回 (直接文件大小总和, 文件数, 子目录数)
fn quick_scan_dir(dir: &Path) -> (u64, u32, u32) {
    let read_dir = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return (0, 0, 0),
    };
    let mut size: u64 = 0;
    let mut files: u32 = 0;
    let mut dirs: u32 = 0;
    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".git" {
            continue;
        }
        match entry.metadata() {
            Ok(m) if m.is_dir() => dirs += 1,
            Ok(m) => {
                files += 1;
                size += m.len();
            }
            Err(_) => {}
        }
    }
    (size, files, dirs)
}

/// BFS 中间结果：每个目录的直接内容统计
struct DirInfo {
    path: String,
    direct_size: u64,
    file_count: u32,
    dir_count: u32,
    parent_index: Option<usize>,
}

/// 扫描指定目录及子目录的文件/目录大小（广度优先）
/// 在后台异步执行，通过 `size:*` 事件实时上报进度和结果
/// 可通过 `scan_size_cancel` 命令取消
#[tauri::command]
pub fn scan_dir_sizes(
    root_path: String,
    depth: Option<usize>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.size_scan_cancel.store(false, Ordering::SeqCst);

    let cancel_flag = state.size_scan_cancel.clone();
    let scan_depth = depth.unwrap_or(10);
    let root = std::path::PathBuf::from(root_path);

    tauri::async_runtime::spawn(async move {
        let root_normalized = normalize_path(&root);
        let _ = app.emit(
            crate::events::event_name::SIZE_SCAN_STARTED,
            crate::events::SizeScanStartedPayload {
                root_path: root_normalized.clone(),
            },
        );

        let mut scanned_dirs: u32 = 0;
        let mut scanned_files: u32 = 0;

        let result = scan_bfs(
            &root,
            scan_depth,
            &cancel_flag,
            &app,
            &root_normalized,
            &mut scanned_dirs,
            &mut scanned_files,
        ).await;

        if let Err(e) = result {
            tracing::error!("BFS 大小扫描失败: {:?}", e);
        }

        let _ = app.emit(
            crate::events::event_name::SIZE_SCAN_CANCELLED,
            crate::events::SizeScanCancelledPayload {
                root_path: root_normalized,
                scanned: scanned_dirs,
            },
        );
    });

    Ok(())
}

/// 取消正在进行的目录大小扫描
#[tauri::command]
pub fn scan_size_cancel(state: State<'_, AppState>) {
    state.size_scan_cancel.store(true, Ordering::SeqCst);
    tracing::info!("用户取消大小扫描");
}

/// 广度优先扫描：先扫描同一层级的所有目录，再进入下一层
/// 扫描过程中实时发射直接文件大小，最终再发射累计总大小
async fn scan_bfs(
    root: &Path,
    max_depth: usize,
    cancel_flag: &std::sync::atomic::AtomicBool,
    app: &AppHandle,
    root_normalized: &str,
    scanned_dirs: &mut u32,
    scanned_files: &mut u32,
) -> AppResult<()> {
    // BFS 队列：(目录路径, 深度, 在 dir_infos 中的父索引)
    let mut queue: VecDeque<(std::path::PathBuf, usize, Option<usize>)> = VecDeque::new();
    let mut dir_infos: Vec<DirInfo> = Vec::new();

    queue.push_back((root.to_path_buf(), 0, None));

    // 第一遍：BFS 扫描，实时发射所有条目（文件+目录）的大小
    while let Some((dir_path, depth, parent_idx)) = queue.pop_front() {
        if cancel_flag.load(Ordering::SeqCst) {
            break;
        }
        if depth > max_depth {
            continue;
        }

        let dir_str = normalize_path(&dir_path);
        *scanned_dirs += 1;

        // 发射进度
        let _ = app.emit(
            crate::events::event_name::SIZE_SCAN_PROGRESS,
            crate::events::SizeScanProgressPayload {
                root_path: root_normalized.to_string(),
                scanned_dirs: *scanned_dirs,
                scanned_files: *scanned_files,
                current_dir: dir_str.clone(),
            },
        );

        let read_dir = match std::fs::read_dir(&dir_path) {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        let mut direct_size: u64 = 0;
        let mut file_count: u32 = 0;
        let mut dir_count: u32 = 0;
        let current_idx = dir_infos.len();

        for entry in read_dir.flatten() {
            if cancel_flag.load(Ordering::SeqCst) {
                break;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            // 跳过隐藏文件（.git 例外）
            if name.starts_with('.') && name != ".git" {
                continue;
            }

            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            if meta.is_dir() {
                dir_count += 1;
                let child_path = entry.path();
                let child_str = normalize_path(&child_path);

                // 立即快速计算子目录的直接文件大小并发射，让用户马上看到
                let (child_direct_size, child_file_count, child_dir_count) =
                    quick_scan_dir(&child_path);
                let _ = app.emit(
                    crate::events::event_name::SIZE_ENTRY_UPDATED,
                    crate::events::SizeEntryUpdatedPayload {
                        path: child_str,
                        size: child_direct_size,
                        file_count: child_file_count,
                        dir_count: child_dir_count,
                    },
                );

                // 将子目录加入 BFS 队列以进行完整扫描
                if depth < max_depth {
                    queue.push_back((child_path, depth + 1, Some(current_idx)));
                }
            } else {
                file_count += 1;
                *scanned_files += 1;
                let file_size = meta.len();
                direct_size += file_size;

                // 立即发射文件大小，让用户实时看到每个文件的大小
                let file_path_str = normalize_path(&entry.path());
                let _ = app.emit(
                    crate::events::event_name::SIZE_ENTRY_UPDATED,
                    crate::events::SizeEntryUpdatedPayload {
                        path: file_path_str,
                        size: file_size,
                        file_count: 0,
                        dir_count: 0,
                    },
                );
            }
        }

        // 发射当前目录的直接文件大小
        let _ = app.emit(
            crate::events::event_name::SIZE_ENTRY_UPDATED,
            crate::events::SizeEntryUpdatedPayload {
                path: dir_str.clone(),
                size: direct_size,
                file_count,
                dir_count,
            },
        );

        dir_infos.push(DirInfo {
            path: dir_str,
            direct_size,
            file_count,
            dir_count,
            parent_index: parent_idx,
        });

        // 每 200 个目录让出一次执行权，防止 UI 卡死
        if *scanned_dirs % 200 == 0 {
            tokio::task::yield_now().await;
        }
    }

    // 如果已取消，跳过累计计算
    if cancel_flag.load(Ordering::SeqCst) {
        return Ok(());
    }

    // 第二遍：自底向上累加子目录大小，计算每个目录的递归总大小
    let total = dir_infos.len();
    let mut cumulative_sizes = vec![0u64; total];
    let mut cumulative_files = vec![0u32; total];
    let mut cumulative_dirs = vec![0u32; total];

    // 逆序遍历（BFS 的逆序保证子目录先于父目录处理）
    for i in (0..total).rev() {
        cumulative_sizes[i] = dir_infos[i].direct_size;
        cumulative_files[i] = dir_infos[i].file_count;
        cumulative_dirs[i] = dir_infos[i].dir_count;

        if let Some(parent_idx) = dir_infos[i].parent_index {
            cumulative_sizes[parent_idx] += cumulative_sizes[i];
            cumulative_files[parent_idx] += cumulative_files[i];
            cumulative_dirs[parent_idx] += cumulative_dirs[i];
        }
    }

    // 第三遍：按 BFS 顺序（上层目录优先）发射最终累计大小
    for i in 0..total {
        let _ = app.emit(
            crate::events::event_name::SIZE_ENTRY_UPDATED,
            crate::events::SizeEntryUpdatedPayload {
                path: dir_infos[i].path.clone(),
                size: cumulative_sizes[i],
                file_count: cumulative_files[i],
                dir_count: cumulative_dirs[i],
            },
        );
        // 每 200 个让出执行权，保持 UI 流畅
        if i % 200 == 0 {
            tokio::task::yield_now().await;
        }
    }

    Ok(())
}
