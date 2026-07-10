// 分支切换弹窗
// 列出当前 Git 仓库的所有分支，允许用户选择切换
// 显示最后提交时间和提交人，按提交时间倒序排列
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GitBranchIcon, CheckIcon, CloseIcon, RefreshIcon } from "@/components/icons";
import { gitBranches, gitCheckout } from "@/ipc";
import type { Branch } from "@/types";

interface BranchSwitchDialogProps {
  open: boolean;
  repoPath: string;
  onClose: () => void;
  onSwitched?: () => void;
}

export function BranchSwitchDialog({ open, repoPath, onClose, onSwitched }: BranchSwitchDialogProps) {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadBranches = async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const list = await gitBranches(repoPath);
      setBranches(list);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && repoPath) {
      setSearch("");
      loadBranches();
    }
  }, [open, repoPath]);

  // 按最后提交时间倒序排列
  const sortByLastCommit = (a: Branch, b: Branch): number => {
    const ta = a.lastCommitTime ?? 0;
    const tb = b.lastCommitTime ?? 0;
    return tb - ta; // 倒序
  };

  const currentBranch = useMemo(
    () => branches.find((b) => b.isCurrent)?.name ?? null,
    [branches]
  );

  const filtered = useMemo(() => {
    if (!search) return branches;
    const q = search.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, search]);

  const localBranches = useMemo(
    () => filtered.filter((b) => !b.isRemote).sort(sortByLastCommit),
    [filtered]
  );
  const remoteBranches = useMemo(
    () => filtered.filter((b) => b.isRemote).sort(sortByLastCommit),
    [filtered]
  );

  const handleSwitch = async (branch: Branch) => {
    if (branch.isCurrent) {
      onClose();
      return;
    }
    setSwitching(true);
    setError(null);
    try {
      await gitCheckout(repoPath, branch.name);
      onSwitched?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSwitching(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 580,
          maxHeight: 560,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* 标题栏 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranchIcon size={18} style={{ color: "var(--git-orange)" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t("branch:title")}</span>
            {currentBranch && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--git-orange)",
                  background: "rgba(240, 78, 35, 0.08)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontWeight: 500,
                  marginLeft: 4,
                }}
              >
                {currentBranch}
              </span>
            )}
          </div>
          <button
            className="tb-btn"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              color: "var(--text-secondary)",
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* 搜索框 */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-soft)" }}>
          <input
            autoFocus
            placeholder={t("branch:searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              height: 32,
              padding: "0 10px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg-app)",
              fontSize: 12,
              color: "var(--text-primary)",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 表头 */}
        {!loading && !error && filtered.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 90px",
              padding: "6px 16px",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              borderBottom: "1px solid var(--border-soft)",
              gap: 8,
            }}
          >
            <span>{t("branch:colBranch")}</span>
            <span>{t("branch:colAuthor")}</span>
            <span style={{ textAlign: "right" }}>{t("branch:colLastCommit")}</span>
          </div>
        )}

        {/* 分支列表 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              {t("branch:loading")}
            </div>
          ) : error ? (
            <div style={{ padding: 24, textAlign: "center", color: "#ef4444", fontSize: 12 }}>
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              {t("branch:empty")}
            </div>
          ) : (
            <>
              {/* 本地分支 */}
              {localBranches.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "6px 16px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {t("branch:local")}
                  </div>
                  {localBranches.map((b) => (
                    <BranchRow
                      key={b.name}
                      branch={b}
                      onSwitch={() => handleSwitch(b)}
                      switching={switching}
                    />
                  ))}
                </>
              )}

              {/* 远端分支 */}
              {remoteBranches.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "6px 16px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      borderTop: "1px solid var(--border-soft)",
                      marginTop: 4,
                    }}
                  >
                    {t("branch:remote")}
                  </div>
                  {remoteBranches.map((b) => (
                    <BranchRow
                      key={b.name}
                      branch={b}
                      onSwitch={() => handleSwitch(b)}
                      switching={switching}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* 底部 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            borderTop: "1px solid var(--border-soft)",
          }}
        >
          <button
            className="tb-btn"
            onClick={loadBranches}
            disabled={loading}
            style={{
              border: "1px solid var(--border)",
              background: "transparent",
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 11,
              cursor: loading ? "default" : "pointer",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshIcon size={13} /> {t("common:refresh")}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {branches.length} {t("branch:branchesCount")}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 格式化时间为简短相对时间 */
function formatTime(ts: number | null): string {
  if (!ts) return "—";
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}个月前`;
  // 超过一年显示日期
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BranchRow({
  branch,
  onSwitch,
  switching,
}: {
  branch: Branch;
  onSwitch: () => void;
  switching: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      onClick={switching ? undefined : onSwitch}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 120px 90px",
        alignItems: "center",
        gap: 8,
        padding: "7px 16px",
        cursor: switching ? "wait" : "pointer",
        fontSize: 12,
        color: "var(--text-primary)",
        background: branch.isCurrent ? "var(--bg-selected)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!branch.isCurrent && !switching)
          (e.currentTarget as HTMLDivElement).style.background = "#f0f4fa";
      }}
      onMouseLeave={(e) => {
        if (!branch.isCurrent)
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* 分支名 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
        <GitBranchIcon
          size={14}
          style={{
            color: branch.isCurrent ? "var(--git-orange)" : "var(--text-tertiary)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: branch.isCurrent ? 600 : 400,
          }}
          title={branch.name}
        >
          {branch.name}
        </span>
        {branch.upstream && (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>↑{branch.upstream}</span>
        )}
        {branch.isCurrent && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 10,
              color: "var(--git-orange)",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <CheckIcon size={12} /> {t("branch:current")}
          </span>
        )}
      </div>

      {/* 提交人 */}
      <span
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={branch.lastCommitAuthor || ""}
      >
        {branch.lastCommitAuthor || "—"}
      </span>

      {/* 最后提交时间 */}
      <span
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          textAlign: "right",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={branch.lastCommitTime ? new Date(branch.lastCommitTime * 1000).toLocaleString() : ""}
      >
        {formatTime(branch.lastCommitTime)}
      </span>
    </div>
  );
}
