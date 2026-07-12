// 文件差异对比弹窗
// 双击变更文件弹出，左右对比原始内容和工作区版本
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { gitDiff } from "@/ipc";
import type { DiffContent } from "@/types";

interface DiffDialogProps {
  open: boolean;
  repoPath: string;
  filePath: string;
  onClose: () => void;
}

export function DiffDialog({ open, repoPath, filePath, onClose }: DiffDialogProps) {
  const { t } = useTranslation();
  const [diff, setDiff] = useState<DiffContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !repoPath || !filePath) return;
    setLoading(true);
    setError(null);
    setDiff(null);
    gitDiff(repoPath, filePath)
      .then((data) => setDiff(data))
      .catch((e) => setError(e?.message || t("diff:loadFailed")))
      .finally(() => setLoading(false));
  }, [open, repoPath, filePath]);

  if (!open) return null;

  // 将文本按行分割用于对比
  const oldLines = diff?.oldContent ? diff.oldContent.split("\n") : [];
  const newLines = diff?.newContent ? diff.newContent.split("\n") : [];

  // 简单逐行对比，标记增/删/不变
  const maxLines = Math.max(oldLines.length, newLines.length);
  const diffRows: { old: string | null; new: string | null; type: "same" | "added" | "removed" | "modified" }[] = [];
  for (let i = 0; i < maxLines; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = i < newLines.length ? newLines[i] : null;
    if (oldLine === null && newLine !== null) {
      diffRows.push({ old: null, new: newLine, type: "added" });
    } else if (oldLine !== null && newLine === null) {
      diffRows.push({ old: oldLine, new: null, type: "removed" });
    } else if (oldLine !== newLine) {
      diffRows.push({ old: oldLine, new: newLine, type: "modified" });
    } else {
      diffRows.push({ old: oldLine, new: newLine, type: "same" });
    }
  }

  // 文件名（取最后一段路径）
  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "90vw",
          maxWidth: 1100,
          height: "80vh",
          background: "var(--bg-surface)",
          borderRadius: 10,
          boxShadow: "0 12px 48px rgba(0,0,0,0.25)",
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
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-bar)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              {t("diff:title")}
            </span>
            <span style={{ fontSize: 12, color: "var(--git-orange)", fontFamily: "monospace" }}>
              {fileName}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              cursor: "pointer",
              color: "var(--text-tertiary)",
              padding: "4px 8px",
              borderRadius: 4,
            }}
            title={t("common:close")}
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)", fontSize: 13 }}>
              {t("diff:loading")}…
            </div>
          )}

          {error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#ef4444", fontSize: 13 }}>
              {error}
            </div>
          )}

          {diff?.isBinary && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)", fontSize: 13 }}>
              {t("diff:binaryFile")}
            </div>
          )}

          {diff && !diff.isBinary && !loading && !error && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "var(--bg-bar)", zIndex: 1 }}>
                  <th style={{ width: 40, padding: "6px 8px", textAlign: "center", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>
                    {t("diff:oldLine")}
                  </th>
                  <th style={{ width: "40%", padding: "6px 8px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>
                    {t("diff:original")} (HEAD)
                  </th>
                  <th style={{ width: 40, padding: "6px 8px", textAlign: "center", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>
                    {t("diff:newLine")}
                  </th>
                  <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontWeight: 400, fontSize: 11 }}>
                    {t("diff:modified")} ({t("diff:workingCopy")})
                  </th>
                </tr>
              </thead>
              <tbody>
                {diffRows.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)" }}>
                      {t("diff:noChanges")}
                    </td>
                  </tr>
                )}
                {diffRows.map((row, i) => {
                  const oldNum = row.old !== null ? i + 1 : "";
                  const newNum = row.new !== null ? i + 1 : "";
                  const bg =
                    row.type === "added"
                      ? "rgba(34,197,94,0.08)"
                      : row.type === "removed"
                        ? "rgba(239,68,68,0.08)"
                        : row.type === "modified"
                          ? "rgba(234,179,8,0.08)"
                          : "transparent";
                  const oldColor = row.type === "removed" || row.type === "modified" ? "#ef4444" : "var(--text-primary)";
                  const newColor = row.type === "added" || row.type === "modified" ? "#22c55e" : "var(--text-primary)";
                  const prefix =
                    row.type === "added" ? "+" :
                    row.type === "removed" ? "-" :
                    row.type === "modified" ? "~" : " ";

                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ padding: "1px 8px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 11, userSelect: "none", whiteSpace: "nowrap" }}>
                        {oldNum}
                      </td>
                      <td style={{ padding: "1px 8px", color: oldColor, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {row.old !== null ? `${prefix} ${row.old}` : ""}
                      </td>
                      <td style={{ padding: "1px 8px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 11, userSelect: "none", whiteSpace: "nowrap" }}>
                        {newNum}
                      </td>
                      <td style={{ padding: "1px 8px", color: newColor, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {row.new !== null ? `${prefix} ${row.new}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 底部状态栏 */}
        {diff && !diff.isBinary && !loading && !error && (
          <div style={{
            padding: "6px 16px", borderTop: "1px solid var(--border)", background: "var(--bg-bar)",
            display: "flex", gap: 16, fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0,
          }}>
            <span> {t("diff:added")}: <span style={{ color: "#22c55e", fontWeight: 600 }}>+{diffRows.filter(r => r.type === "added").length}</span></span>
            <span> {t("diff:removed")}: <span style={{ color: "#ef4444", fontWeight: 600 }}>-{diffRows.filter(r => r.type === "removed").length}</span></span>
            <span> {t("diff:modified")}: <span style={{ color: "#e8b339", fontWeight: 600 }}>~{diffRows.filter(r => r.type === "modified").length}</span></span>
            <span style={{ marginLeft: "auto", fontFamily: "monospace" }}>{filePath}</span>
          </div>
        )}
      </div>
    </div>
  );
}
