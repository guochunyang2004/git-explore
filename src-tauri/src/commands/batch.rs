//! 批量命令（附录 B.3）
//! 通过 BatchOpsManager 并发编排多仓库 git 操作

use crate::AppState;
use crate::types::{BatchOp, BatchResult};
use tauri::{AppHandle, State};

/// 启动批次，立即返回 batchId，进度走 batch:* 事件
#[tauri::command]
pub fn batch_run(
    op: BatchOp,
    repo_paths: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> String {
    // 转换为 (path, name, branch) 三元组
    let repos: Vec<(String, String, String)> = repo_paths
        .into_iter()
        .map(|p| {
            let name = std::path::Path::new(&p)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&p)
                .to_string();
            (p, name, String::new()) // branch 由 batch_ops 内部动态获取
        })
        .collect();

    let count = repos.len();
    let batch_id = state.batch_ops.run(op, repos, app);
    tracing::info!("批量 {} 启动，批次: {}，仓库数: {}", format!("{:?}", op), batch_id, count);
    batch_id
}

/// 取消整个批次
#[tauri::command]
pub fn batch_cancel(batch_id: String, state: State<'_, AppState>) {
    state.batch_ops.cancel(&batch_id);
    tracing::info!("取消批次: {}", batch_id);
}

/// 重试单个失败仓库
#[tauri::command]
pub fn batch_retry(
    batch_id: String,
    repo_path: String,
    state: State<'_, AppState>,
) {
    state.batch_ops.retry(&batch_id, &repo_path);
}

/// 查询批次当前状态
#[tauri::command]
pub fn batch_status(
    batch_id: String,
    state: State<'_, AppState>,
) -> Option<BatchResult> {
    state.batch_ops.status(&batch_id)
}
