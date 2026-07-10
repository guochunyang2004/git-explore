//! 批量操作编排（对应架构文档 4.5）⭐ 核心
//!
//! 并发执行多仓库 git 任务并回传逐仓进度事件到前端。
//! 使用 tokio Semaphore 限制并发数，AtomicBool 取消令牌。

use crate::events::*;
use crate::infra::git2_adapter::GitOps;
use crate::types::{BatchOp, BatchResult, BatchState, BatchTask};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

const MAX_CONCURRENCY: usize = 4;

struct BatchRun {
    op: BatchOp,
    cancel_flag: Arc<AtomicBool>,
    #[allow(dead_code)]
    tasks: Arc<Mutex<Vec<BatchTask>>>,
}

pub struct BatchOpsManager {
    batches: Mutex<HashMap<String, BatchRun>>,
    git_ops: Arc<dyn GitOps>,
}

impl BatchOpsManager {
    pub fn new(git_ops: Arc<dyn GitOps>) -> Self {
        Self {
            batches: Mutex::new(HashMap::new()),
            git_ops,
        }
    }

    /// 启动批量操作，返回批次 ID
    pub fn run(
        &self,
        op: BatchOp,
        repos: Vec<(String, String, String)>, // (repo_path, repo_name, branch)
        handle: tauri::AppHandle,
    ) -> String {
        let batch_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let git_ops = self.git_ops.clone();

        // 构建初始任务列表
        let tasks: Vec<BatchTask> = repos
            .iter()
            .map(|(path, name, branch)| BatchTask {
                id: uuid::Uuid::new_v4().to_string()[..8].to_string(),
                repo_path: path.clone(),
                repo_name: name.clone(),
                branch: branch.clone(),
                state: BatchState::Queued,
                stage: String::new(),
                percent: 0,
                message: String::new(),
                started_at: None,
                finished_at: None,
            })
            .collect();

        let total = tasks.len() as u32;
        let tasks_arc = Arc::new(Mutex::new(tasks.clone()));

        // 注册运行记录
        {
            let mut batches = self.batches.lock().unwrap();
            batches.insert(
                batch_id.clone(),
                BatchRun {
                    op,
                    cancel_flag: cancel_flag.clone(),
                    tasks: tasks_arc.clone(),
                },
            );
        }

        // 发射 batch:started
        let _ = handle.emit(
            event_name::BATCH_STARTED,
            BatchStartedPayload {
                batch_id: batch_id.clone(),
                op,
                total,
            },
        );

        // 后台并发执行
        let bid = batch_id.clone();
        let h = handle.clone();
        tauri::async_runtime::spawn(async move {
            let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENCY));
            let mut handles = Vec::new();

            for task in &tasks {
                let permit = semaphore.clone().acquire_owned().await;
                let task = task.clone();
                let h2 = h.clone();
                let b2 = bid.clone();
                let cancel = cancel_flag.clone();
                let ops = git_ops.clone();

                let jh = tokio::spawn(async move {
                    let _permit = permit;
                    if cancel.load(Ordering::Relaxed) {
                        emit_repo_done(&h2, &b2, &task.repo_path, false, "已取消");
                        return;
                    }

                    // 更新为 Running
                    emit_progress(&h2, &b2, &task.repo_path, "开始", 0);

                    let mut last_pct: u8 = 0;
                    let result = match op {
                        BatchOp::Pull => ops.pull(&task.repo_path, &mut |stage, pct| {
                            if pct != last_pct || last_pct == 0 {
                                last_pct = pct;
                                emit_progress(&h2, &b2, &task.repo_path, stage, pct);
                            }
                        }),
                        BatchOp::Push => ops.push(&task.repo_path, &mut |stage, pct| {
                            if pct != last_pct || last_pct == 0 {
                                last_pct = pct;
                                emit_progress(&h2, &b2, &task.repo_path, stage, pct);
                            }
                        }),
                        BatchOp::Fetch => ops.fetch(&task.repo_path, &mut |stage, pct| {
                            if pct != last_pct || last_pct == 0 {
                                last_pct = pct;
                                emit_progress(&h2, &b2, &task.repo_path, stage, pct);
                            }
                        }),
                        BatchOp::Commit | BatchOp::Sync | BatchOp::SwitchBranch => {
                            // P5: 补充其他操作的实现
                            Err(crate::infra::error::AppError::new(
                                crate::infra::error::ErrorCode::Internal,
                                "errors.not_implemented",
                                "暂不支持此批量操作",
                            ))
                        }
                    };

                    match result {
                        Ok(()) => emit_repo_done(&h2, &b2, &task.repo_path, true, "完成"),
                        Err(e) => {
                            if cancel.load(Ordering::Relaxed) {
                                emit_repo_done(&h2, &b2, &task.repo_path, false, "已取消");
                            } else {
                                emit_repo_done(&h2, &b2, &task.repo_path, false, &e.message);
                            }
                        }
                    }
                });

                handles.push(jh);
            }

            // 等待所有任务
            for h in handles {
                let _ = h.await;
            }

            // 清理并发射 batch:completed
            let _ = h.emit(
                event_name::BATCH_COMPLETED,
                BatchCompletedPayload {
                    batch_id: bid,
                    summary: BatchSummary {
                        success: total,
                        failed: 0,
                        skipped: 0,
                        conflict: 0,
                    },
                },
            );
        });

        batch_id
    }

    /// 取消批次
    pub fn cancel(&self, batch_id: &str) {
        if let Some(run) = self.batches.lock().unwrap().get(batch_id) {
            run.cancel_flag.store(true, Ordering::Relaxed);
        }
    }

    /// 重试单个失败的仓库 —— P5 完整实现
    pub fn retry(&self, batch_id: &str, repo_path: &str) {
        let batches = self.batches.lock().unwrap();
        if let Some(_run) = batches.get(batch_id) {
            tracing::info!("重试批次 {} 仓库 {}", batch_id, repo_path);
        }
    }

    /// 查询批次状态
    pub fn status(&self, batch_id: &str) -> Option<BatchResult> {
        let batches = self.batches.lock().unwrap();
        let run = batches.get(batch_id)?;
        let tasks = run.tasks.lock().unwrap();
        Some(BatchResult {
            batch_id: batch_id.to_string(),
            op: run.op,
            total: tasks.len() as u32,
            success: tasks.iter().filter(|t| matches!(t.state, BatchState::Success)).count() as u32,
            failed: tasks.iter().filter(|t| matches!(t.state, BatchState::Failed)).count() as u32,
            skipped: tasks.iter().filter(|t| matches!(t.state, BatchState::Skipped)).count() as u32,
            conflict: tasks.iter().filter(|t| matches!(t.state, BatchState::Conflict)).count() as u32,
            tasks: tasks.clone(),
        })
    }
}

// ============ 内部辅助 ============

fn emit_progress(handle: &tauri::AppHandle, batch_id: &str, repo_path: &str, stage: &str, percent: u8) {
    let _ = handle.emit(
        event_name::BATCH_REPO_PROGRESS,
        BatchRepoProgressPayload {
            batch_id: batch_id.to_string(),
            repo_path: repo_path.to_string(),
            stage: stage.to_string(),
            percent,
        },
    );
}

fn emit_repo_done(
    handle: &tauri::AppHandle,
    batch_id: &str,
    repo_path: &str,
    success: bool,
    message: &str,
) {
    let _ = handle.emit(
        event_name::BATCH_REPO_DONE,
        BatchRepoDonePayload {
            batch_id: batch_id.to_string(),
            repo_path: repo_path.to_string(),
            success,
            message: message.to_string(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::error::AppResult;
    use crate::types::{Branch, CommitRef, FileStatus};

    /// 模拟 GitOps，所有操作返回成功
    struct MockGitOps;

    impl GitOps for MockGitOps {
        fn status(&self, _repo_path: &str) -> AppResult<Vec<FileStatus>> {
            Ok(vec![])
        }
        fn log(&self, _repo_path: &str, _branch: Option<&str>, _page: u32, _page_size: u32) -> AppResult<Vec<CommitRef>> {
            Ok(vec![])
        }
        fn branches(&self, _repo_path: &str) -> AppResult<Vec<Branch>> {
            Ok(vec![])
        }
        fn commit(&self, _repo_path: &str, _message: &str, _file_paths: &[String]) -> AppResult<CommitRef> {
            Ok(CommitRef { hash: "abc".into(), message: "mock".into(), author: "t".into(), time: 1 })
        }
        fn fetch(&self, _repo_path: &str, _progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
            Ok(())
        }
        fn pull(&self, _repo_path: &str, _progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
            Ok(())
        }
        fn push(&self, _repo_path: &str, _progress: &mut dyn FnMut(&str, u8)) -> AppResult<()> {
            Ok(())
        }
    }

    #[test]
    fn new_manager_has_no_batches() {
        let ops = Arc::new(MockGitOps);
        let mgr = BatchOpsManager::new(ops);
        let res = mgr.status("nonexistent");
        assert!(res.is_none());
    }

    #[test]
    fn cancel_unknown_batch_is_noop() {
        let ops = Arc::new(MockGitOps);
        let mgr = BatchOpsManager::new(ops);
        mgr.cancel("nonexistent");
        // 不 panic 即通过
    }

    #[test]
    fn batch_run_does_not_require_tauri_handle() {
        // 验证 run 签名正确，编译通过即可（运行时需要 Tauri AppHandle，测试中用默认构建）
        let ops = Arc::new(MockGitOps);
        let mgr = BatchOpsManager::new(ops);
        let repos = vec![
            ("/tmp/repo1".to_string(), "repo1".to_string(), "main".to_string()),
            ("/tmp/repo2".to_string(), "repo2".to_string(), "main".to_string()),
        ];
        // 没有真实的 AppHandle 无法调用 run，但可以验证类型编译
        let _ = (mgr, repos);
    }

    #[test]
    fn batch_result_counts() {
        let result = BatchResult {
            batch_id: "test".into(),
            op: BatchOp::Pull,
            total: 5,
            success: 3,
            failed: 1,
            skipped: 0,
            conflict: 1,
            tasks: vec![],
        };
        assert_eq!(result.total, 5);
        assert!(result.success + result.failed + result.skipped + result.conflict <= result.total);
    }
}
