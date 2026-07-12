// 工具栏
// "扫描Git"触发后端 scan_git_repos，扫描当前目录及子目录的 git 仓库
// "打开文件夹"保留用于选择工作区根目录
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpenIcon, PullIcon, CommitIcon, PushIcon, GitBranchIcon,
  HistoryIcon, RefreshIcon, SearchIcon, GridIcon, SettingsIcon,
  ArrowLeftIcon, ArrowUpIcon, CloneIcon,
} from "@/components/icons";
import { useWorkspaceStore, useBatchSelectionStore, useScanStore, useGitReposStore } from "@/stores";
import { scanGitRepos, scanCancel, gitPull, gitPush, onEvent } from "@/ipc";
import { BranchSwitchDialog } from "@/components/BranchSwitchDialog";
import { CloneDialog } from "@/components/CloneDialog";
import { CommitDialog } from "@/components/CommitDialog";
import { useState, useEffect } from "react";

export function ToolBar({ onSettings }: { onSettings: () => void }) {
  const { t } = useTranslation();
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const currentDir = useWorkspaceStore((s) => s.currentDir);
  const navigateTo = useWorkspaceStore((s) => s.navigateTo);
  const goBack = useWorkspaceStore((s) => s.goBack);
  const goUp = useWorkspaceStore((s) => s.goUp);
  const canGoBack = useWorkspaceStore((s) => s.canGoBack);
  const canGoUp = useWorkspaceStore((s) => s.canGoUp);
  const toggleBatchMode = useBatchSelectionStore((s) => s.toggleBatchMode);
  const batchMode = useBatchSelectionStore((s) => s.batchMode);
  const scanning = useScanStore((s) => s.scanning);
  const setRepos = useGitReposStore((s) => s.setRepos);
  const repos = useGitReposStore((s) => s.repos);
  const selectedEntry = useWorkspaceStore((s) => s.selectedEntry);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [gitOpProgress, setGitOpProgress] = useState<{ op: string; stage: string; percent: number; repoPath: string } | null>(null);
  const [gitOpError, setGitOpError] = useState<string | null>(null);
  const [gitOpSuccess, setGitOpSuccess] = useState<string | null>(null);

  // 监听 git:progress 事件（用于 pull/push 进度）
  useEffect(() => {
    if (!gitOpProgress) return;
    const unlisten = onEvent<{ repoPath: string; stage: string; percent: number }>(
      "git:progress",
      (payload) => {
        setGitOpProgress((prev) => prev ? { ...prev, stage: payload.stage, percent: payload.percent } : prev);
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [gitOpProgress?.op]);

  const handlePull = async () => {
    if (!selectedRepoPath) return;
    setGitOpError(null);
    setGitOpSuccess(null);
    setGitOpProgress({ op: "pull", stage: "connecting", percent: 10, repoPath: selectedRepoPath });
    try {
      await gitPull(selectedRepoPath);
      setGitOpSuccess(t("gitops:pullSuccess"));
      const targetPath = currentDir || rootPath;
      if (targetPath) scanGitRepos(targetPath);
    } catch (e: any) {
      setGitOpError(e?.message || t("gitops:pullFailed"));
    } finally {
      setTimeout(() => setGitOpProgress(null), 1500);
    }
  };

  const handlePush = async () => {
    if (!selectedRepoPath) return;
    setGitOpError(null);
    setGitOpSuccess(null);
    setGitOpProgress({ op: "push", stage: "connecting", percent: 10, repoPath: selectedRepoPath });
    try {
      await gitPush(selectedRepoPath);
      setGitOpSuccess(t("gitops:pushSuccess"));
      const targetPath = currentDir || rootPath;
      if (targetPath) scanGitRepos(targetPath);
    } catch (e: any) {
      setGitOpError(e?.message || t("gitops:pushFailed"));
    } finally {
      setTimeout(() => setGitOpProgress(null), 1500);
    }
  };

  const handleOpen = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await openWorkspace(selected);
    }
  };

  const handleScan = async () => {
    const targetPath = currentDir || rootPath;
    if (!targetPath) return;
    setRepos([]);
    await scanGitRepos(targetPath);
  };

  const handleScanCancel = async () => {
    await scanCancel();
  };

  const handleRefresh = () => {
    if (rootPath) navigateTo(rootPath);
  };

  // 确定当前选中目录对应的 Git 仓库路径
  const selectedRepoPath = (() => {
    if (!selectedEntry) return null;
    const direct = repos.find((r) => r.path === selectedEntry);
    if (direct) return direct.path;
    const parent = repos.find((r) => selectedEntry.startsWith(r.path + "\\") || selectedEntry.startsWith(r.path + "/"));
    if (parent) return parent.path;
    return null;
  })();

  const handleBranchSwitch = () => {
    if (selectedRepoPath) setBranchDialogOpen(true);
  };

  const btnStyle = (active = false): React.CSSProperties => ({
    height: 32, minWidth: 32, padding: "0 8px", border: "1px solid transparent",
    background: active ? "var(--git-orange)" : "transparent",
    color: active ? "#fff" : "var(--text-primary)", borderRadius: "var(--r-sm)",
    display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
    fontSize: 12, fontWeight: active ? 600 : 400,
  });
  const disabledBtnStyle: React.CSSProperties = {
    height: 32, minWidth: 32, padding: "0 8px", border: "1px solid transparent",
    background: "transparent", color: "var(--text-tertiary)",
    borderRadius: "var(--r-sm)", display: "inline-flex", alignItems: "center",
    gap: 6, cursor: "default", fontSize: 12, fontWeight: 400, opacity: 0.4,
  };

  const divider = <div style={{ width: 1, height: 22, background: "var(--divider)", margin: "0 4px" }} />;

  return (
    <div style={{
      height: "var(--toolbar-h)", background: "var(--bg-bar)",
      borderBottom: "1px solid var(--border-soft)",
      display: "flex", alignItems: "center", padding: "0 8px", gap: 2, flexShrink: 0,
    }}>
      {/* 打开文件夹 */}
      <button className="tb-btn" style={{ ...btnStyle(), background: "var(--accent)", color: "#fff", borderColor: "var(--accent)", fontWeight: 600 }} onClick={handleOpen}>
        <FolderOpenIcon size={15} /> {t("toolbar:openFolder")}
      </button>
      {divider}
      {/* 导航按钮：后退 + 向上 */}
      <button
        className="tb-btn"
        style={canGoBack ? btnStyle() : disabledBtnStyle}
        title={t("toolbar:goBack")}
        onClick={() => canGoBack && goBack()}
        disabled={!canGoBack}
      >
        <ArrowLeftIcon size={16} />
      </button>
      <button
        className="tb-btn"
        style={canGoUp ? btnStyle() : disabledBtnStyle}
        title={t("toolbar:goUp")}
        onClick={() => canGoUp && goUp()}
        disabled={!canGoUp}
      >
        <ArrowUpIcon size={16} />
      </button>
      {divider}
      {/* 扫描 Git 按钮 */}
      {scanning ? (
        <button
          className="tb-btn"
          style={{ ...btnStyle(true), background: "#e74c3c", borderColor: "#e74c3c" }}
          title={t("toolbar:scanCancel")}
          onClick={handleScanCancel}
        >
          <RefreshIcon size={15} /> {t("toolbar:scanning")}…
        </button>
      ) : (
        <button
          className="tb-btn"
          style={{ ...btnStyle(), border: "1px solid var(--git-orange)", color: "var(--git-orange)", fontWeight: 600 }}
          title={t("toolbar:scanGit")}
          onClick={handleScan}
          disabled={!rootPath}
        >
          <GitBranchIcon size={15} /> {t("toolbar:scanGit")}
        </button>
      )}
      {divider}
      {/* 克隆仓库 */}
      <button
        className="tb-btn"
        style={{ ...btnStyle(), border: "1px solid var(--git-orange)", color: "var(--git-orange)" }}
        title={t("toolbar:clone")}
        onClick={() => setCloneDialogOpen(true)}
      >
        <CloneIcon size={15} /> {t("toolbar:clone")}
      </button>
      {divider}
      {/* 拉取 */}
      <button
        className="tb-btn"
        style={selectedRepoPath ? btnStyle() : disabledBtnStyle}
        title={selectedRepoPath ? t("toolbar:pull") : t("gitops:noRepo")}
        onClick={handlePull}
        disabled={!selectedRepoPath}
      >
        <PullIcon size={15} /> {t("toolbar:pull")}
      </button>
      {/* 提交 */}
      <button
        className="tb-btn"
        style={selectedRepoPath ? btnStyle() : disabledBtnStyle}
        title={selectedRepoPath ? t("toolbar:commit") : t("gitops:noRepo")}
        onClick={() => setCommitDialogOpen(true)}
        disabled={!selectedRepoPath}
      >
        <CommitIcon size={15} /> {t("toolbar:commit")}
      </button>
      {/* 推送 */}
      <button
        className="tb-btn"
        style={selectedRepoPath ? btnStyle() : disabledBtnStyle}
        title={selectedRepoPath ? t("toolbar:push") : t("gitops:noRepo")}
        onClick={handlePush}
        disabled={!selectedRepoPath}
      >
        <PushIcon size={15} /> {t("toolbar:push")}
      </button>
      {divider}
      <button
        className="tb-btn"
        style={selectedRepoPath ? { ...btnStyle(), border: "1px solid var(--git-orange)", color: "var(--git-orange)" } : disabledBtnStyle}
        title={selectedRepoPath ? t("toolbar:branch") : t("toolbar:branchNoRepo")}
        onClick={handleBranchSwitch}
        disabled={!selectedRepoPath}
      >
        <GitBranchIcon size={15} /> {t("toolbar:branch")}
      </button>
      <button className="tb-btn" style={btnStyle()} title={t("toolbar:history")}><HistoryIcon size={15} /> {t("toolbar:history")}</button>
      {divider}
      <button className="tb-btn" style={btnStyle(batchMode)} onClick={toggleBatchMode} title={t("toolbar:batchMode")}>
        <GridIcon size={15} /> {t("toolbar:batchMode")}
      </button>
      <button className="tb-btn" style={btnStyle()} title={t("common:refresh")} onClick={handleRefresh}>
        <RefreshIcon size={15} /> {t("common:refresh")}
      </button>
      <div style={{ flex: 1 }} />
      <button className="tb-btn" style={btnStyle()} title={t("common:settings")} onClick={onSettings}>
        <SettingsIcon size={15} />
      </button>
      <div style={{ display: "flex", alignItems: "center", height: 30, width: 220, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "0 8px", gap: 6 }}>
        <SearchIcon size={14} style={{ color: "var(--text-tertiary)" }} />
        <input placeholder={t("toolbar:searchPlaceholder")} style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, flex: 1, color: "var(--text-primary)", fontFamily: "inherit" }} />
      </div>
      {/* 分支切换弹窗 */}
      <BranchSwitchDialog
        open={branchDialogOpen}
        repoPath={selectedRepoPath || ""}
        onClose={() => setBranchDialogOpen(false)}
        onSwitched={() => {
          const targetPath = currentDir || rootPath;
          if (targetPath) scanGitRepos(targetPath);
        }}
      />
      {/* 克隆仓库弹窗 */}
      <CloneDialog
        open={cloneDialogOpen}
        onClose={() => setCloneDialogOpen(false)}
      />
      {/* 提交弹窗 */}
      <CommitDialog
        open={commitDialogOpen}
        repoPath={selectedRepoPath || ""}
        onClose={() => setCommitDialogOpen(false)}
        onCommitted={() => {
          const targetPath = currentDir || rootPath;
          if (targetPath) scanGitRepos(targetPath);
        }}
      />
      {/* Pull/Push 进度提示 */}
      {gitOpProgress && (
        <div style={{
          position: "fixed", bottom: 40, right: 16, zIndex: 1000,
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "12px 16px", minWidth: 280,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", fontSize: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {gitOpProgress.op === "pull" ? <PullIcon size={14} /> : <PushIcon size={14} />}
            <span style={{ fontWeight: 600 }}>
              {gitOpProgress.op === "pull" ? t("gitops:pullTitle") : t("gitops:pushTitle")}
            </span>
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
              {gitOpProgress.stage} {gitOpProgress.percent}%
            </span>
          </div>
          <div style={{ height: 4, background: "var(--bg-app)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${gitOpProgress.percent}%`,
              background: "var(--git-orange)", borderRadius: 2, transition: "width 0.2s ease",
            }} />
          </div>
        </div>
      )}
      {/* Pull/Push 错误提示 */}
      {gitOpError && !gitOpProgress && (
        <div style={{
          position: "fixed", bottom: 40, right: 16, zIndex: 1000,
          background: "var(--bg-surface)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8, padding: "10px 14px", minWidth: 280, maxWidth: 400,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", fontSize: 12, color: "#ef4444",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>{gitOpError}</span>
          <button onClick={() => setGitOpError(null)} style={{ marginLeft: 8, border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>✕</button>
        </div>
      )}
      {/* Pull/Push 成功提示 */}
      {gitOpSuccess && !gitOpProgress && (
        <div style={{
          position: "fixed", bottom: 40, right: 16, zIndex: 1000,
          background: "var(--bg-surface)", border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: 8, padding: "10px 14px", minWidth: 280, maxWidth: 400,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", fontSize: 12, color: "#22c55e",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>{gitOpSuccess}</span>
          <button onClick={() => setGitOpSuccess(null)} style={{ marginLeft: 8, border: "none", background: "transparent", color: "#22c55e", cursor: "pointer", fontSize: 11 }}>✕</button>
        </div>
      )}
    </div>
  );
}
