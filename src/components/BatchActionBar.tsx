// 批量操作栏（勾选仓库后浮现，对应架构文档 4.5 & mockup）
// 显示已选仓库数 + 批量拉取/推送/获取/同步/提交 + 全选/清除
import { useTranslation } from "react-i18next";
import { GridIcon, PullIcon, PushIcon, RefreshIcon, SyncIcon, CommitIcon } from "@/components/icons";
import { useBatchSelectionStore, useGitReposStore } from "@/stores";
import { batchRun } from "@/ipc";
import type { BatchOp } from "@/types";

export function BatchActionBar() {
  const { t } = useTranslation();
  const selectedRepos = useBatchSelectionStore((s) => s.selectedRepos);
  const clearAll = useBatchSelectionStore((s) => s.clearAll);
  const selectAll = useBatchSelectionStore((s) => s.selectAll);
  const repos = useGitReposStore((s) => s.repos);
  const count = selectedRepos.size;
  const allPaths = repos.map((r) => r.path);

  const handleBatch = async (op: BatchOp) => {
    try {
      const batchId = await batchRun(op, Array.from(selectedRepos));
      console.log("Batch started:", batchId, op);
    } catch (e) {
      console.error("Batch failed:", e);
    }
  };

  const btnStyle = (solid = false): React.CSSProperties => ({
    height: 28, padding: "0 10px", border: `1px solid var(--git-orange)`,
    background: solid ? "var(--git-orange)" : "#fff",
    color: solid ? "#fff" : "var(--git-orange)",
    borderRadius: "var(--r-sm)", display: "inline-flex", alignItems: "center", gap: 5,
    cursor: "pointer", fontSize: 12, fontWeight: 600,
  });

  return (
    <div className="batch-bar">
      <div className="bb-count">
        <GridIcon size={14} />
        {t("batch:selectedCount", { count })}
      </div>
      <span className="bb-divider" />
      <button className="bb-btn solid" title={t("batch:pull")} style={btnStyle(true)} onClick={() => handleBatch("pull")}>
        <PullIcon size={13} /> {t("batch:pull")}
      </button>
      <button className="bb-btn" title={t("batch:push")} style={btnStyle()} onClick={() => handleBatch("push")}>
        <PushIcon size={13} /> {t("batch:push")}
      </button>
      <button className="bb-btn" title={t("batch:fetch")} style={btnStyle()} onClick={() => handleBatch("fetch")}>
        <RefreshIcon size={13} /> {t("batch:fetch")}
      </button>
      <button className="bb-btn" title={t("batch:sync")} style={btnStyle()} onClick={() => handleBatch("sync")}>
        <SyncIcon size={13} /> {t("batch:sync")}
      </button>
      <button className="bb-btn" title={t("batch:commit")} style={btnStyle()} onClick={() => handleBatch("commit")}>
        <CommitIcon size={13} /> {t("batch:commit")}
      </button>
      <div style={{ flex: 1 }} />
      <button className="bb-btn ghost" onClick={() => selectAll(allPaths)}>
        {t("filetree:selectAll")}
      </button>
      <button className="bb-btn ghost" onClick={clearAll}>
        {t("filetree:clearAll")}
      </button>
    </div>
  );
}
