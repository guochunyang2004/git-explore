// 右侧文件列表（对应架构文档 4.4 & mockup）
// 列显示：名称 / Git 状态 / 分支 / 提交人 / 提交时间 / 修改日期 / 大小 / 最后提交
// 从 useWorkspaceStore.entries 获取后端真实数据
// 支持点击列头排序，箭头标记正序/倒序
// 目录大小从 SizeScanStore 获取
import { useTranslation } from "react-i18next";
import { useMemo, useState, useCallback } from "react";
import { FileIcon, FolderIcon, GitBranchIcon } from "@/components/icons";
import { useWorkspaceStore, useGitReposStore, useSizeScanStore } from "@/stores";
import type { FileEntry, FileStatus, GitRepoInfo } from "@/types";

// ============ 路径规范化 ============
function normalizePath(p: string): string {
  // 去掉 Windows extended-length 前缀 \\?\
  let s = p;
  if (s.startsWith("\\\\?\\")) s = s.slice(4);
  // 统一为反斜杠
  s = s.replace(/\//g, "\\");
  return s;
}

// ============ 排序类型 ============
type SortKey = "name" | "status" | "branch" | "author" | "commitTime" | "modified" | "size" | "commit";
type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDir;
}

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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ============ 排序比较函数 ============
function getStatusOrder(status: FileStatus | null): number {
  if (!status) return 99;
  const order: Record<string, number> = {
    conflict: 0,
    modified: 1,
    added: 2,
    deleted: 3,
    untracked: 4,
  };
  return order[status.code] ?? 98;
}

// dirSize 查找辅助（排序时复用）
type DirSizeMap = Map<string, { size: number; fileCount: number; dirCount: number }>;
function getDirSize(entry: FileEntry, dirSizes: DirSizeMap): number {
  if (!entry.isDir) return entry.size;
  const normPath = normalizePath(entry.path);
  const ds = dirSizes.get(normPath) ?? dirSizes.get(entry.path);
  return ds?.size ?? 0;
}

function compareEntries(a: FileEntry, b: FileEntry, sort: SortState, reposMap: Map<string, GitRepoInfo>, dirSizes: DirSizeMap): number {
  let cmp = 0;

  switch (sort.key) {
    case "name": {
      if (a.isDir !== b.isDir) cmp = a.isDir ? -1 : 1;
      else cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      break;
    }
    case "status": {
      const sa = getStatusOrder(a.gitStatus);
      const sb = getStatusOrder(b.gitStatus);
      cmp = sa - sb;
      if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      break;
    }
    case "branch": {
      const ra = a.isDir ? reposMap.get(a.path) : undefined;
      const rb = b.isDir ? reposMap.get(b.path) : undefined;
      const ba = ra?.branch ?? "";
      const bb = rb?.branch ?? "";
      cmp = ba.localeCompare(bb);
      if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      break;
    }
    case "author": {
      const ra = a.isDir ? reposMap.get(a.path) : undefined;
      const rb = b.isDir ? reposMap.get(b.path) : undefined;
      const aa = ra?.lastCommitAuthor ?? "";
      const ab = rb?.lastCommitAuthor ?? "";
      cmp = aa.localeCompare(ab);
      if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      break;
    }
    case "commitTime": {
      const ra = a.isDir ? reposMap.get(a.path) : undefined;
      const rb = b.isDir ? reposMap.get(b.path) : undefined;
      const ta = ra?.lastCommitTime ?? 0;
      const tb = rb?.lastCommitTime ?? 0;
      cmp = ta - tb;
      if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      break;
    }
    case "modified": {
      cmp = a.modified - b.modified;
      if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      break;
    }
    case "size": {
      if (a.isDir !== b.isDir) cmp = a.isDir ? -1 : 1;
      else {
        const sizeA = getDirSize(a, dirSizes);
        const sizeB = getDirSize(b, dirSizes);
        cmp = sizeA - sizeB;
        if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      }
      break;
    }
    case "commit": {
      const ma = a.lastCommit?.message ?? "";
      const mb = b.lastCommit?.message ?? "";
      cmp = ma.localeCompare(mb);
      if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      break;
    }
  }

  return sort.dir === "desc" ? -cmp : cmp;
}

// ============ 文件行 ============
function FileRow({ entry, isSelected, onClick, onDoubleClick, reposMap, dirSize }: {
  entry: FileEntry;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  reposMap: Map<string, GitRepoInfo>;
  dirSize?: { size: number; fileCount: number; dirCount: number };
}) {
  const hasGitInfo = entry.gitStatus !== null || entry.lastCommit !== null;
  const repo = entry.isDir ? reposMap.get(entry.path) : undefined;

  const folderColor = repo ? (repo.isClean ? "#22c55e" : "#ef4444") : "#e8b339";

  return (
    <div
      className={`list-row${isSelected ? " selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="cell name">
        {entry.isDir ? (
          <FolderIcon size={16} style={{ color: folderColor, flexShrink: 0 }} />
        ) : (
          <FileIcon size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
        )}
        <span className="fname">{entry.name}</span>
      </div>

      <div className="cell status">
        {hasGitInfo ? (
          <StatusPill status={entry.gitStatus} />
        ) : (
          <span className="cell-na">—</span>
        )}
      </div>

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

      <div className="cell author">
        {repo ? (
          <span className="author-label" title={repo.lastCommitAuthor}>
            {repo.lastCommitAuthor || "—"}
          </span>
        ) : (
          <span className="cell-na">—</span>
        )}
      </div>

      <div className="cell commit-time">
        {repo ? (
          <span className="commit-time-label">{formatDate(repo.lastCommitTime)}</span>
        ) : (
          <span className="cell-na">—</span>
        )}
      </div>

      <div className="cell modified">
        {formatDate(entry.modified)}
      </div>

      <div className="cell size">
        {entry.isDir ? (
          dirSize ? (
            <span title={`${dirSize.fileCount} 文件, ${dirSize.dirCount} 子目录`}>
              {formatSize(dirSize.size)}
              <span style={{ color: "var(--text-tertiary)", fontSize: 10, marginLeft: 4 }}>
                ({dirSize.fileCount + dirSize.dirCount})
              </span>
            </span>
          ) : "—"
        ) : formatSize(entry.size)}
      </div>

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

// ============ 列头 ============
function ListHeader({ sort, onSort }: { sort: SortState; onSort: (key: SortKey) => void }) {
  const { t } = useTranslation();

  const renderArrow = (key: SortKey) => {
    if (sort.key !== key) return <span className="sort-arr" style={{ opacity: 0.3 }}>⇅</span>;
    return <span className="sort-arr" style={{ opacity: 1 }}>{sort.dir === "asc" ? "▲" : "▼"}</span>;
  };

  const colStyle = (key: SortKey): React.CSSProperties => ({
    cursor: "pointer",
    color: sort.key === key ? "var(--accent)" : "var(--text-secondary)",
  });

  return (
    <div className="list-header">
      <div className="list-col name" style={colStyle("name")} onClick={() => onSort("name")}>
        {t("filelist:colName")} {renderArrow("name")}
      </div>
      <div className="list-col status" style={colStyle("status")} onClick={() => onSort("status")}>
        {t("filelist:colStatus")} {renderArrow("status")}
      </div>
      <div className="list-col branch" style={colStyle("branch")} onClick={() => onSort("branch")}>
        {t("filelist:colBranch")} {renderArrow("branch")}
      </div>
      <div className="list-col author" style={colStyle("author")} onClick={() => onSort("author")}>
        {t("filelist:colAuthor")} {renderArrow("author")}
      </div>
      <div className="list-col commit-time" style={colStyle("commitTime")} onClick={() => onSort("commitTime")}>
        {t("filelist:colCommitTime")} {renderArrow("commitTime")}
      </div>
      <div className="list-col modified" style={colStyle("modified")} onClick={() => onSort("modified")}>
        {t("filelist:colModified")} {renderArrow("modified")}
      </div>
      <div className="list-col size" style={colStyle("size")} onClick={() => onSort("size")}>
        {t("filelist:colSize")} {renderArrow("size")}
      </div>
      <div className="list-col commit" style={colStyle("commit")} onClick={() => onSort("commit")}>
        {t("filelist:colCommit")} {renderArrow("commit")}
      </div>
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
  const dirSizes = useSizeScanStore((s) => s.dirSizes);

  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });

  const reposMap = useMemo(() => {
    const m = new Map<string, GitRepoInfo>();
    for (const r of repos) m.set(r.path, r);
    return m;
  }, [repos]);

  const sortedEntries = useMemo(() => {
    const arr = [...entries];
    arr.sort((a, b) => compareEntries(a, b, sort, reposMap, dirSizes));
    return arr;
  }, [entries, sort, reposMap, dirSizes]);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }, []);

  const handleClick = (entry: FileEntry) => {
    setSelected(entry.path);
  };

  const handleDoubleClick = (entry: FileEntry) => {
    if (entry.isDir) {
      navigateTo(entry.path);
    }
  };

  return (
    <>
      <ListHeader sort={sort} onSort={handleSort} />
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
          sortedEntries.map((entry) => {
            const normPath = normalizePath(entry.path);
            const ds = entry.isDir ? (dirSizes.get(normPath) ?? dirSizes.get(entry.path)) : undefined;
            return (
              <FileRow
                key={entry.path}
                entry={entry}
                isSelected={selectedEntry === entry.path}
                onClick={() => handleClick(entry)}
                onDoubleClick={() => handleDoubleClick(entry)}
                reposMap={reposMap}
                dirSize={ds}
              />
            );
          })
        )}
      </div>
    </>
  );
}
