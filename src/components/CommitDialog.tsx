// 提交对话框
// 输入提交信息，选择要提交的文件（显示文件名），双击文件打开差异对比
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CommitIcon, CloseIcon } from "@/components/icons";
import { gitStatus, gitCommit } from "@/ipc";
import type { FileStatus } from "@/types";
import { DiffDialog } from "@/components/DiffDialog";

interface CommitDialogProps {
  open: boolean;
  repoPath: string;
  onClose: () => void;
  onCommitted?: () => void;
}

export function CommitDialog({ open, repoPath, onClose, onCommitted }: CommitDialogProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [diffFile, setDiffFile] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await gitStatus(repoPath);
      setStatuses(result);
      const allIndices = result.map((_, i) => i);
      setSelectedFiles(new Set(allIndices));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (open && repoPath) {
      setMessage("");
      setSuccess(false);
      setError(null);
      loadStatus();
    }
  }, [open, repoPath, loadStatus]);

  if (!open) return null;

  const toggleFile = (idx: number) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedFiles.size === statuses.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(statuses.map((_, i) => i)));
    }
  };

  const handleCommit = async () => {
    const msg = message.trim();
    if (!msg || selectedFiles.size === 0) return;

    setCommitting(true);
    setError(null);
    setSuccess(false);

    try {
      // 获取选中文件的路径
      const filePaths = Array.from(selectedFiles).map((idx) => statuses[idx]?.path).filter(Boolean);
      await gitCommit(repoPath, msg, filePaths);
      setSuccess(true);
      onCommitted?.();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCommitting(false);
    }
  };

  const handleClose = () => {
    if (committing) return;
    setMessage("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  const handleFileDoubleClick = (idx: number) => {
    const s = statuses[idx];
    if (s?.path) setDiffFile(s.path);
  };

  const statusIcon = (code: string) => {
    switch (code) {
      case "modified": return <span style={{ color: "#e8b339", fontWeight: 600, width: 16, textAlign: "center" }}>M</span>;
      case "untracked": return <span style={{ color: "#22c55e", fontWeight: 600, width: 16, textAlign: "center" }}>?</span>;
      case "deleted": return <span style={{ color: "#ef4444", fontWeight: 600, width: 16, textAlign: "center" }}>D</span>;
      case "renamed": return <span style={{ color: "#3b82f6", fontWeight: 600, width: 16, textAlign: "center" }}>R</span>;
      case "conflict": return <span style={{ color: "#ef4444", fontWeight: 600, width: 16, textAlign: "center" }}>!</span>;
      default: return <span style={{ color: "var(--text-tertiary)", width: 16, textAlign: "center" }}>·</span>;
    }
  };

  // 文件名提取（取路径最后一段）
  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  };

  // 文件所在目录（相对仓库根）
  const getFileDir = (path: string) => {
    const parts = path.split(/[/\\]/);
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
  };

  return (
    <div
      onClick={committing ? undefined : handleClose}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.3)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620, maxHeight: "80vh", background: "var(--bg-surface)",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)", display: "flex",
          flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* 标题栏 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border-soft)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CommitIcon size={18} style={{ color: "var(--git-orange)" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t("commit:title")}</span>
            {repoPath && (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "monospace", marginLeft: 8 }}>
                {repoPath}
              </span>
            )}
          </div>
          <button
            className="tb-btn"
            onClick={handleClose}
            disabled={committing}
            style={{
              border: "none", background: "transparent", cursor: committing ? "default" : "pointer",
              padding: 4, display: "flex", alignItems: "center",
              color: "var(--text-secondary)", opacity: committing ? 0.4 : 1,
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* 内容 */}
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14, overflow: "auto", flex: 1 }}>
          {/* 提交信息 */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 5 }}>
              {t("commit:messageLabel")}
            </label>
            <textarea
              autoFocus
              placeholder={t("commit:messagePlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={committing}
              rows={3}
              style={{
                width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
                borderRadius: 6, background: "var(--bg-app)", fontSize: 12,
                color: "var(--text-primary)", outline: "none", fontFamily: "inherit",
                boxSizing: "border-box", resize: "vertical", opacity: committing ? 0.6 : 1,
              }}
            />
          </div>

          {/* 文件列表 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
                {t("commit:filesLabel")} ({selectedFiles.size}/{statuses.length})
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  {t("commit:doubleClickHint")}
                </span>
                {statuses.length > 0 && (
                  <button
                    className="tb-btn"
                    onClick={toggleAll}
                    disabled={committing}
                    style={{
                      border: "none", background: "transparent", cursor: "pointer",
                      fontSize: 11, color: "var(--git-orange)", padding: 0,
                    }}
                  >
                    {selectedFiles.size === statuses.length ? t("commit:deselectAll") : t("commit:selectAll")}
                  </button>
                )}
              </div>
            </div>
            <div style={{
              border: "1px solid var(--border)", borderRadius: 6, maxHeight: 240,
              overflow: "auto", background: "var(--bg-app)",
            }}>
              {loading ? (
                <div style={{ padding: 12, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                  {t("commit:loading")}
                </div>
              ) : statuses.length === 0 ? (
                <div style={{ padding: 12, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                  {t("commit:noChanges")}
                </div>
              ) : (
                statuses.map((s, idx) => {
                  const fileName = getFileName(s.path);
                  const fileDir = getFileDir(s.path);
                  return (
                    <div
                      key={idx}
                      onClick={() => !committing && toggleFile(idx)}
                      onDoubleClick={() => !committing && handleFileDoubleClick(idx)}
                      title={s.path}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
                        cursor: committing ? "default" : "pointer", fontSize: 12,
                        borderBottom: idx < statuses.length - 1 ? "1px solid var(--border-soft)" : "none",
                        background: selectedFiles.has(idx) ? "rgba(240,78,35,0.04)" : "transparent",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(idx)}
                        onChange={() => {}}
                        disabled={committing}
                        style={{ margin: 0, accentColor: "var(--git-orange)", flexShrink: 0 }}
                      />
                      {statusIcon(s.code)}
                      <span style={{ color: "var(--text-primary)", fontFamily: "monospace", fontSize: 11, fontWeight: 500 }}>
                        {fileName}
                      </span>
                      {fileDir && (
                        <span style={{ color: "var(--text-tertiary)", fontSize: 10, fontFamily: "monospace" }}>
                          — {fileDir}/
                        </span>
                      )}
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>
                        {s.staged ? t("commit:staged") : t("commit:unstaged")}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 错误 */}
          {error && (
            <div style={{ fontSize: 12, color: "#ef4444", padding: "8px 10px", background: "rgba(239,68,68,0.06)", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}

          {/* 成功 */}
          {success && (
            <div style={{ fontSize: 12, color: "#22c55e", padding: "8px 10px", background: "rgba(34,197,94,0.06)", borderRadius: 6, border: "1px solid rgba(34,197,94,0.2)" }}>
              {t("commit:success")}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "10px 16px", borderTop: "1px solid var(--border-soft)",
        }}>
          <button
            className="tb-btn"
            onClick={handleClose}
            disabled={committing}
            style={{
              height: 32, padding: "0 16px", border: "1px solid var(--border)",
              background: "transparent", borderRadius: 6,
              cursor: committing ? "default" : "pointer", fontSize: 12,
              color: "var(--text-secondary)", opacity: committing ? 0.4 : 1,
            }}
          >
            {success ? t("common:close") : t("common:cancel")}
          </button>
          <button
            className="tb-btn"
            onClick={handleCommit}
            disabled={committing || !message.trim() || selectedFiles.size === 0}
            style={{
              height: 32, padding: "0 16px",
              border: "1px solid var(--git-orange)",
              background: committing || !message.trim() || selectedFiles.size === 0 ? "var(--text-tertiary)" : "var(--git-orange)",
              color: "#fff", borderRadius: 6,
              cursor: committing || !message.trim() || selectedFiles.size === 0 ? "default" : "pointer",
              fontSize: 12, fontWeight: 600,
              opacity: !message.trim() || selectedFiles.size === 0 ? 0.4 : 1,
            }}
          >
            {committing ? t("commit:committing") : t("commit:commit")}
          </button>
        </div>
      </div>

      {/* 文件差异对比弹窗 */}
      <DiffDialog
        open={!!diffFile}
        repoPath={repoPath}
        filePath={diffFile || ""}
        onClose={() => setDiffFile(null)}
      />
    </div>
  );
}
