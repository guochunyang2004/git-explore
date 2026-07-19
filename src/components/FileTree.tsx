// 左侧文件树（对应架构文档 4.4 & mockup）
// 支持树形展开/折叠、多选 git 仓库、批量操作
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderIcon, GitBranchIcon, FileIcon, ChevronRightIcon,
  CheckIcon, RefreshIcon, DriveIcon,
} from "@/components/icons";
import { useWorkspaceStore, useGitReposStore, useBatchSelectionStore, useScanStore, useConfigStore, useSizeScanStore } from "@/stores";
import type { GitRepoInfo, FileEntry, FileStatus } from "@/types";
import { scanGitRepos } from "@/ipc";

// ============ 批量复选框 ============
function CheckBox({ checked, onClick, title }: { checked: boolean; onClick: () => void; title: string }) {
  return (
    <span
      className={`tree-check${checked ? " checked" : ""}`}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <CheckIcon />
    </span>
  );
}

// ============ Git 角标 ============
function RepoBadges({ repo }: { repo: GitRepoInfo }) {
  const { t } = useTranslation();
  if (repo.isClean && repo.ahead === 0 && repo.behind === 0) {
    return (
      <span className="tree-badge clean" title={t("git:badge.clean")}>
        <CheckIcon size={9} />
      </span>
    );
  }
  return (
    <>
      {repo.ahead > 0 && (
        <span className="tree-badge ahead" title={t("git:badge.ahead", { count: repo.ahead })}>
          ↑{repo.ahead}
        </span>
      )}
      {repo.behind > 0 && (
        <span className="tree-badge behind" title={t("git:badge.behind", { count: repo.behind })}>
          ↓{repo.behind}
        </span>
      )}
    </>
  );
}

// ============ Git 状态标记 ============
function StatusMark({ status }: { status: FileStatus }) {
  const colors: Record<string, string> = {
    modified: "var(--st-modified)",
    added: "var(--st-added)",
    deleted: "var(--st-deleted)",
    untracked: "var(--st-untracked)",
    conflict: "var(--st-conflict)",
  };
  const labels: Record<string, string> = {
    modified: "M",
    added: "A",
    deleted: "D",
    untracked: "?",
    conflict: "U",
  };
  return (
    <span className="tree-status" style={{ color: colors[status.code] ?? "var(--text-tertiary)" }}>
      {labels[status.code] ?? status.code[0]}
    </span>
  );
}

// ============ 格式化大小 ============
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ============ 路径规范化 ============
function normalizePath(p: string): string {
  let s = p;
  if (s.startsWith("\\\\?\\")) s = s.slice(4);
  s = s.replace(/\//g, "\\");
  return s;
}

// ============ 树节点（递归，支持展开/折叠和懒加载子目录） ============
function TreeNode({ entry, depth, reposMap, currentPath }: {
  entry: FileEntry;
  depth: number;
  reposMap: Map<string, GitRepoInfo>;
  currentPath: string | null;
}) {
  const { t } = useTranslation();
  const toggleExpand = useWorkspaceStore((s) => s.toggleExpand);
  const isExpanded = useWorkspaceStore((s) => s.expandedPaths.has(entry.path));
  const treeChildren = useWorkspaceStore((s) => s.treeChildren.get(entry.path));
  const setSelected = useWorkspaceStore((s) => s.setSelected);
  const navigateTo = useWorkspaceStore((s) => s.navigateTo);
  const scanning = useScanStore((s) => s.scanning);
  const dirSizes = useSizeScanStore((s) => s.dirSizes);

  const repo = reposMap.get(entry.path) ?? null;
  const isRepo = repo !== null;
  const isActive = currentPath === entry.path;

  // 目录大小
  const normPath = normalizePath(entry.path);
  const ds = entry.isDir ? (dirSizes.get(normPath) ?? dirSizes.get(entry.path)) : undefined;

  // 批量选择
  const selectedRepos = useBatchSelectionStore((s) => s.selectedRepos);
  const toggleRepo = useBatchSelectionStore((s) => s.toggleRepo);
  const isChecked = isRepo && selectedRepos.has(entry.path);

  const handleClick = useCallback(() => {
    setSelected(entry.path);
    if (entry.isDir) {
      // 单击：展开/折叠 + 同步导航右侧列表
      toggleExpand(entry.path);
      navigateTo(entry.path);
      // 根据设置决定是否自动扫描该目录的 Git 仓库
      const autoScan = useConfigStore.getState().autoScanGit;
      if (autoScan && !scanning) {
        scanGitRepos(entry.path);
      }
    }
  }, [entry, setSelected, toggleExpand, navigateTo, scanning]);

  return (
    <>
      <div
        className={`tree-node${isRepo ? " is-repo" : ""}${isActive ? " active" : ""}`}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        onClick={handleClick}
        onDoubleClick={() => {
          if (entry.isDir) {
            setSelected(entry.path);
            navigateTo(entry.path);
          }
        }}
      >
        {/* 批量复选框（非 Git 仓库节点占位以保持对齐） */}
        {isRepo ? (
          <CheckBox
            checked={isChecked}
            onClick={() => toggleRepo(entry.path)}
            title={t("filetree:hint")}
          />
        ) : (
          <span className="tree-check-placeholder" />
        )}

        {/* 展开/折叠 */}
        <span
          className={`tree-chevron${isExpanded ? " open" : ""}`}
          onClick={(e) => {
            if (entry.isDir) {
              e.stopPropagation();
              toggleExpand(entry.path);
            }
          }}
        >
          {entry.isDir ? <ChevronRightIcon /> : <span style={{ width: 10, height: 10 }} />}
        </span>

        {/* 图标 */}
        {isRepo ? (
          <FolderIcon size={16} style={{ color: repo.isClean ? "#22c55e" : "#ef4444", flexShrink: 0 }} />
        ) : entry.isDir ? (
          <FolderIcon size={16} style={{ color: "#e8b339", flexShrink: 0 }} />
        ) : (
          <FileIcon size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
        )}

        {/* 名称 */}
        <span className="tree-label">{entry.name}</span>

        {/* 仓库分支名 */}
        {isRepo && repo.branch && repo.branch !== "HEAD" && (
          <span className="tree-meta">
            <span className="branch">{repo.branch}</span>
          </span>
        )}

        {/* Git 仓库角标 */}
        {isRepo && <RepoBadges repo={repo} />}

        {/* 目录大小 */}
        {ds && (
          <span
            className="tree-meta"
            style={{ color: "var(--text-tertiary)", fontSize: 10, marginLeft: "auto", marginRight: 4, flexShrink: 0 }}
            title={`${ds.fileCount} 文件, ${ds.dirCount} 子目录`}
          >
            {formatSize(ds.size)}
          </span>
        )}

        {/* 文件 Git 状态 */}
        {!isRepo && entry.gitStatus && <StatusMark status={entry.gitStatus} />}
      </div>

      {/* 递归渲染子节点 */}
      {isExpanded && entry.isDir && treeChildren && treeChildren.length > 0 && (
        treeChildren.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            reposMap={reposMap}
            currentPath={currentPath}
          />
        ))
      )}
    </>
  );
}

// ============ 控件栏 ============
function SidebarHeader() {
  const { t } = useTranslation();
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const navigateTo = useWorkspaceStore((s) => s.navigateTo);

  return (
    <div className="side-header">
      <span>{t("filetree:title")}</span>
      <span className="hint">{t("filetree:hint")}</span>
      <div className="actions">
        <button
          className="side-icon-btn"
          title={t("common:refresh")}
          onClick={() => rootPath && navigateTo(rootPath)}
        >
          <RefreshIcon size={13} />
        </button>
      </div>
    </div>
  );
}

// ============ 文件树主组件 ============
export function FileTree() {
  const { t } = useTranslation();
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const treeEntries = useWorkspaceStore((s) => s.treeEntries);
  const selectedEntry = useWorkspaceStore((s) => s.selectedEntry);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const drives = useWorkspaceStore((s) => s.drives);
  const recentRoots = useWorkspaceStore((s) => s.recentRoots);
  const repos = useGitReposStore((s) => s.repos);
  const selectedRepos = useBatchSelectionStore((s) => s.selectedRepos);
  const selectAll = useBatchSelectionStore((s) => s.selectAll);
  const clearAll = useBatchSelectionStore((s) => s.clearAll);
  const setSelected = useWorkspaceStore((s) => s.setSelected);
  const goHome = useWorkspaceStore((s) => s.goHome);
  const toggleExpand = useWorkspaceStore((s) => s.toggleExpand);
  const thisPCExpanded = useWorkspaceStore((s) => s.expandedPaths.has(""));

  // 仓库路径 → GitRepoInfo 映射
  const reposMap = useMemo(() => {
    const m = new Map<string, GitRepoInfo>();
    for (const r of repos) m.set(r.path, r);
    return m;
  }, [repos]);

  // 仓库路径集合（用于全选）
  const repoPaths = repos.map((r) => r.path);

  const showBatchModeUI = selectedRepos.size > 0;

  return (
    <>
      <SidebarHeader />

      {/* 识别结果提示条 */}
      {rootPath && repos.length > 0 && (
        <div className="detect-bar">
          <GitBranchIcon size={13} style={{ color: "var(--git-orange)" }} />
          {t("filetree:detected", { count: repos.length })}
        </div>
      )}

      {/* 树节点列表 */}
      <div className="side-list">
        {rootPath === null ? (
          // 未打开工作区时：展示“此电脑” + 磁盘列表 + 最近打开
          drives.length > 0 ? (
            <>
              <div
                className={`tree-node${selectedEntry === "" ? " active" : ""}`}
                style={{ paddingLeft: "8px", fontWeight: 600 }}
                onClick={() => {
                  setSelected("");
                  goHome();
                }}
              >
                <span style={{ width: 10, height: 10 }} />
                <DriveIcon size={16} style={{ color: "var(--text-primary)", flexShrink: 0 }} />
                <span className="tree-label">{t("filetree:thisPC")}</span>
              </div>
              <div style={{ padding: "4px 8px 2px 22px", fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>
                {t("filetree:drives")}
              </div>
              {drives.map((drive) => (
                <div
                  key={drive.path}
                  className="tree-node"
                  style={{ paddingLeft: "22px" }}
                  onClick={() => openWorkspace(drive.path)}
                  title={drive.path}
                >
                  <span style={{ width: 10, height: 10 }} />
                  <DriveIcon size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                  <span className="tree-label">{drive.name}</span>
                </div>
              ))}
              {/* 最近打开 */}
              {recentRoots.length > 0 && (
                <>
                  <div style={{ padding: "6px 8px 2px 22px", marginTop: 4, fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>
                    {t("filetree:recent")}
                  </div>
                  {recentRoots.map((rp) => (
                    <div
                      key={rp}
                      className="tree-node"
                      style={{ paddingLeft: "22px" }}
                      onClick={() => openWorkspace(rp)}
                      title={rp}
                    >
                      <span style={{ width: 10, height: 10 }} />
                      <FolderIcon size={16} style={{ color: "#e8b339", flexShrink: 0 }} />
                      <span className="tree-label">{rp.split(/[\\/]/).filter(Boolean).pop() || rp}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              {t("toolbar:openFolder")}
            </div>
          )
        ) : treeEntries.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            {t("common:empty")}
          </div>
        ) : (
          <>
            {/* "此电脑"虚拟根节点 — 可展开/折叠 */}
            <div
              className={`tree-node${selectedEntry === "" ? " active" : ""}`}
              style={{ paddingLeft: "8px", fontWeight: 600 }}
              onClick={() => {
                setSelected("");
                toggleExpand("");
              }}
            >
              <span style={{ width: 10, height: 10 }} />
              <span
                className={`tree-chevron${thisPCExpanded ? " open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand("");
                }}
              >
                <ChevronRightIcon />
              </span>
              <DriveIcon size={16} style={{ color: "var(--text-primary)", flexShrink: 0 }} />
              <span className="tree-label">{t("filetree:thisPC")}</span>
            </div>
            {/* "此电脑"展开后：显示磁盘列表（treeEntries），每个磁盘用 TreeNode 渲染 */}
            {thisPCExpanded &&
              treeEntries.map((entry) => (
                <TreeNode
                  key={entry.path}
                  entry={entry}
                  depth={1}
                  reposMap={reposMap}
                  currentPath={selectedEntry}
                />
              ))
            }
          </>
        )}
      </div>

      {/* 批量选择快捷操作 */}
      {showBatchModeUI && repoPaths.length > 0 && (
        <div style={{
          display: "flex", gap: 4, padding: "4px 8px 8px",
          borderTop: "1px solid var(--border-soft)",
        }}>
          <button
            className="side-small-btn"
            onClick={() => selectAll(repoPaths)}
          >
            {t("filetree:selectAll")}
          </button>
          <button
            className="side-small-btn"
            onClick={clearAll}
          >
            {t("filetree:clearAll")}
          </button>
        </div>
      )}
    </>
  );
}
