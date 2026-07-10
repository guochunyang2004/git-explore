// 右侧文件列表（对应架构文档 4.4 & mockup）
// 列显示：名称 / Git 状态 / 修改日期 / 大小 / 最后提交
// 从 useWorkspaceStore.entries 获取后端真实数据
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { FileIcon, FolderIcon, GitBranchIcon } from "@/components/icons";
import { useWorkspaceStore, useGitReposStore } from "@/stores";
import type { FileEntry, FileStatus, GitRepoInfo } from "@/types";

// ============ Git 状态小药丸 ============
function StatusPill({ status }: { status: FileStatus | null }) {
  if (!status) return <span className="st-pill dot" title="无变更" />;

  const codeMap: Record<string, string> = {
    modified: "M",
    added: "A",
    deleted: "D",
    untracked: "?",
    conflict: "U",
  };
  const label = codeMap[status.code] ?? "?";
  const cls = label === "?" ? "Q" : label;
  return (
    <span className={`st-pill ${cls}`} title={status.code}>
      {label}
    </span>
  );
}

// ============ 格式化函数 ============
function formatDate(ts: number): string {
  if (ts <= 0) return "—";
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============ 文件列表行 ============
function FileRow({ entry, isSelected, onClick, onDoubleClick, reposMap }: {
  entry: FileEntry;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  reposMap: Map<string, GitRepoInfo>;
}) {
  const hasGitInfo = entry.gitStatus !== null || entry.lastCommit !== null;
  const repo = entry.isDir ? reposMap.get(entry.path) : undefined;

  // 目录图标颜色：Git仓库且干净=绿色，Git仓库且有未提交=红色，普通目录=黄色
  const folderColor = repo ? (repo.isClean ? "#22c55e" : "#ef4444") : "#e8b339";

  return (
    <div
      className={`list-row${isSelected ? " selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* 名称 */}
      <div className="cell name">
        {entry.isDir ? (
          <FolderIcon size={16} style={{ color: folderColor, flexShrink: 0 }} />
        ) : (
          <FileIcon size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
        )}
        <span className="fname">{entry.name}</span>
      </div>

      {/* Git 状态 */}
      <div className="cell status">
        {hasGitInfo ? (
          <StatusPill status={entry.gitStatus} />
        ) : (
          <span className="cell-na">—</span>
        )}
      </div>

      {/* 分支（仅 Git 仓库目录显示） */}
      <div className="cell branch">
        {repo ? (
          <span className="branch-label" title={repo.branch}>
            <GitBranchIcon size={12} />
            <span className="branch-name">{repo.branch}</span>
          </span>
        ) : (
          <span className="cell-na">—</span>
        )}
      </div>

      {/* 上次提交人（仅 Git 仓库目录显示） */}
      <div className="cell author">
        {repo ? (
          <span className="author-label" title={repo.lastCommitAuthor}>
            {repo.lastCommitAuthor || "—"}
          </span>
        ) : (
          <span className="cell-na">—</span>
        )}
      </div>

      {/* 提交时间（仅 Git 仓库目录显示） */}
      <div className="cell commit-time">
        {repo ? (
          <span className="commit-time-label">{formatDate(repo.lastCommitTime)}</span>
        ) : (
          <span className="cell-na">—</span>
        )}
      </div>

      {/* 修改日期 */}
      <div className="cell modified">
        {formatDate(entry.modified)}
      </div>

      {/* 大小 */}
      <div className="cell size">
        {entry.isDir ? "—" : formatSize(entry.size)}
      </div>

      {/* 最后提交 */}
      <div className="cell commit">
        {entry.lastCommit ? (
          <>
            <span className="hash">{entry.lastCommit.hash}</span>
            <span className="msg">{entry.lastCommit.message}</span>
          </>
        ) : entry.gitStatus?.code === "untracked" ? (
          <>
            <span className="hash" style={{ color: "var(--text-tertiary)" }}>—</span>
            <span className="msg" style={{ color: "var(--text-tertiary)" }}>未跟踪</span>
          </>
        ) : (
          <span className="cell-na">—</span>
        )}
      </div>
    </div>
  );
}

// ============ 列表头 ============
function ListHeader() {
  const { t } = useTranslation();
  return (
    <div className="list-header">
      <div className="list-col name">{t("filelist:colName")} <span className="sort-arr">▲</span></div>
      <div className="list-col status">{t("filelist:colStatus")}</div>
      <div className="list-col branch">{t("filelist:colBranch")}</div>
      <div className="list-col author">{t("filelist:colAuthor")}</div>
      <div className="list-col commit-time">{t("filelist:colCommitTime")}</div>
      <div className="list-col modified">{t("filelist:colModified")}</div>
      <div className="list-col size">{t("filelist:colSize")}</div>
      <div className="list-col commit">{t("filelist:colCommit")}</div>
    </div>
  );
}

// ============ 文件列表主组件 ============
export function FileList() {
  const entries = useWorkspaceStore((s) => s.entries);
  const selectedEntry = useWorkspaceStore((s) => s.selectedEntry);
  const navigateTo = useWorkspaceStore((s) => s.navigateTo);
  const setSelected = useWorkspaceStore((s) => s.setSelected);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const repos = useGitReposStore((s) => s.repos);

  const reposMap = useMemo(() => {
    const m = new Map<string, GitRepoInfo>();
    for (const r of repos) m.set(r.path, r);
    return m;
  }, [repos]);

  // 单击：仅选中
  const handleClick = (entry: FileEntry) => {
    setSelected(entry.path);
  };

  // 双击：目录则进入导航
  const handleDoubleClick = (entry: FileEntry) => {
    if (entry.isDir) {
      navigateTo(entry.path);
    }
  };

  return (
    <>
      <ListHeader />
      <div className="list-body">
        {rootPath === null ? (
          <div style={{
            padding: 60, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}>
            <FolderIcon size={48} style={{ color: "var(--border)", opacity: 0.6 }} />
            打开一个文件夹以浏览文件
          </div>
        ) : entries.length === 0 ? (
          <div style={{
            padding: 60, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13,
          }}>
            此目录为空
          </div>
        ) : (
          entries.map((entry) => (
            <FileRow
              key={entry.path}
              entry={entry}
              isSelected={selectedEntry === entry.path}
              onClick={() => handleClick(entry)}
              onDoubleClick={() => handleDoubleClick(entry)}
              reposMap={reposMap}
            />
          ))
        )}
      </div>
    </>
  );
}
