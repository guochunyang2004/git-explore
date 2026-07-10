// 批量进度面板（执行批量操作时浮现，对应架构文档 4.5 & mockup）
// 显示逐仓进度：状态图标 + 仓库名 + 分支 + 阶段 + 进度条
import { useTranslation } from "react-i18next";
import {
  PullIcon, SuccessIcon, RefreshIcon, QueueIcon, ErrorIcon,
} from "@/components/icons";
import { useBatchProgressStore } from "@/stores";
import { batchCancel, batchRetry } from "@/ipc";
import type { BatchTask, BatchState } from "@/types";

function StatusIcon({ state }: { state: BatchState }) {
  switch (state) {
    case "success":
      return <span className="bp-status-icon ok"><SuccessIcon size={14} /></span>;
    case "failed":
      return <span className="bp-status-icon fail"><ErrorIcon size={14} /></span>;
    case "running":
      return <span className="bp-status-icon run"><RefreshIcon size={14} /></span>;
    case "conflict":
      return <span className="bp-status-icon fail"><ErrorIcon size={14} /></span>;
    case "cancelled":
    case "skipped":
    default:
      return <span className="bp-status-icon queue"><QueueIcon size={14} /></span>;
  }
}

function RowProgress({ task }: { task: BatchTask }) {
  const cls = task.state === "success" ? "done"
    : task.state === "failed" || task.state === "conflict" ? "fail"
    : "";
  return (
    <span className={`bp-rowprog${cls ? ` ${cls}` : ""}`}>
      <div className="fill" style={{ width: `${task.percent}%` }} />
    </span>
  );
}

export function BatchProgressPanel() {
  const { t } = useTranslation();
  const batchId = useBatchProgressStore((s) => s.batchId);
  const tasks = useBatchProgressStore((s) => s.tasks);


  const success = tasks.filter((t) => t.state === "success").length;
  const running = tasks.filter((t) => t.state === "running").length;
  const queued = tasks.filter((t) => t.state === "queued").length;
  const total = tasks.length;
  const done = tasks.filter((t) => t.state !== "queued" && t.state !== "running").length;
  const overallPercent = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleCancel = async () => {
    if (batchId) {
      try { await batchCancel(batchId); } catch { /* ignore */ }
    }
  };

  const handleRetry = async (repoPath: string) => {
    if (batchId) {
      try { await batchRetry(batchId, repoPath); } catch { /* ignore */ }
    }
  };

  return (
    <div className="batch-panel">
      {/* 面板头 */}
      <div className="bp-head">
        <div className="bp-title">
          <PullIcon size={14} style={{ color: "var(--git-orange)" }} />
          {t("batch:title", { op: "拉取" })}
        </div>
        <div className="bp-summary">
          {t("batch:summary", { success, running, queued, total })}
        </div>
        <div style={{ flex: 1 }} />
        <div className="bp-prog-wrap" title={`${overallPercent}%`}>
          <div className="bp-prog-bar" style={{ width: `${overallPercent}%` }} />
        </div>
        <div className="bp-actions">
          <button className="bp-ibtn" title={t("common:cancel")} onClick={handleCancel}>
            <svg viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2">
              <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
              <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* 任务行列表 */}
      <div className="bp-list">
        {tasks.map((task) => (
          <div key={task.repoPath} className="bp-row">
            <StatusIcon state={task.state} />
            <span className="bp-repo">{task.repoName}</span>
            <span className="bp-branch">{task.branch}</span>
            <span className={`bp-stage${task.state === "running" ? " run" : task.state === "failed" || task.state === "conflict" ? " fail" : ""}`}>
              {task.stage || (task.state === "queued" ? t("batch:stage.queued") : task.message)}
            </span>
            <RowProgress task={task} />
            {(task.state === "failed" || task.state === "conflict") && (
              <span className="bp-retry" onClick={() => handleRetry(task.repoPath)}>
                {t("common:refresh")}
              </span>
            )}
          </div>
        ))}
        {tasks.length === 0 && (
          <div style={{ padding: 12, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            {t("common:empty")}
          </div>
        )}
      </div>
    </div>
  );
}
