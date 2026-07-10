// 分支切换弹窗
// 列出当前 Git 仓库的所有分支，允许用户选择切换
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

  const filtered = useMemo(() => {
    if (!search) return branches;
    const q = search.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, search]);

  const localBranches = filtered.filter((b) => !b.isRemote);
  const remoteBranches = filtered.filter((b) => b.isRemote);

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
          width: 460,
          maxHeight: 520,
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
        display: "flex",
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
      <GitBranchIcon
        size={14}
        style={{
          color: branch.isCurrent ? "var(--git-orange)" : "var(--text-tertiary)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
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
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>↑{branch.upstream}</span>
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
          }}
        >
          <CheckIcon size={12} /> {t("branch:current")}
        </span>
      )}
    </div>
  );
}
