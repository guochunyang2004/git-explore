// 克隆仓库弹窗
// 输入 Git 仓库地址和目标路径，执行 git clone
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloneIcon, CloseIcon, FolderOpenIcon } from "@/components/icons";
import { gitClone } from "@/ipc";
import { onEvent } from "@/ipc";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "@/stores";

interface CloneDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CloneDialog({ open, onClose }: CloneDialogProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [destDir, setDestDir] = useState("");
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const currentDir = useWorkspaceStore((s) => s.currentDir);
  const selectedEntry = useWorkspaceStore((s) => s.selectedEntry);

  // 每次打开弹窗时，默认目标目录 = 当前选中目录 > 当前导航目录 > 工作区根目录
  useEffect(() => {
    if (open) {
      setDestDir(selectedEntry || currentDir || rootPath || "");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听克隆进度
  useEffect(() => {
    if (!cloning) return;
    const unlisten = onEvent<{ repoPath: string; stage: string; percent: number }>(
      "git:progress",
      (payload) => {
        setStage(payload.stage);
        setProgress(payload.percent);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [cloning]);

  if (!open) return null;

  const repoName = (() => {
    const trimmed = url.trim().replace(/\.git$/, "");
    const parts = trimmed.split(/[\/:]/);
    return parts[parts.length - 1] || "repo";
  })();

  const handleBrowse = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setDestDir(selected);
    }
  };

  const handleClone = async () => {
    const u = url.trim();
    const d = destDir.trim();
    if (!u || !d) return;

    setCloning(true);
    setError(null);
    setSuccess(false);
    setProgress(0);
    setStage("connecting");

    try {
      await gitClone(u, d);
      setSuccess(true);
      setProgress(100);
      setStage("done");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCloning(false);
    }
  };

  const handleClose = () => {
    if (cloning) return; // 克隆中不允许关闭
    if (success) {
      // 克隆成功后，打开克隆的仓库目录
      const clonePath = `${destDir.replace(/\\/g, "/")}/${repoName}`;
      openWorkspace(clonePath.replace(/\//g, "\\"));
    }
    setUrl("");
    setError(null);
    setSuccess(false);
    setProgress(0);
    setStage("");
    onClose();
  };

  return (
    <div
      onClick={cloning ? undefined : handleClose}
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
          width: 520,
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
            <CloneIcon size={18} style={{ color: "var(--git-orange)" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t("clone:title")}</span>
          </div>
          <button
            className="tb-btn"
            onClick={handleClose}
            disabled={cloning}
            style={{
              border: "none",
              background: "transparent",
              cursor: cloning ? "default" : "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              color: "var(--text-secondary)",
              opacity: cloning ? 0.4 : 1,
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* 内容 */}
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* URL 输入 */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 5 }}>
              {t("clone:urlLabel")}
            </label>
            <input
              autoFocus
              placeholder={t("clone:urlPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={cloning}
              style={{
                width: "100%",
                height: 34,
                padding: "0 10px",
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg-app)",
                fontSize: 12,
                color: "var(--text-primary)",
                outline: "none",
                fontFamily: "monospace",
                boxSizing: "border-box",
                opacity: cloning ? 0.6 : 1,
              }}
            />
          </div>

          {/* 目标目录 */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 5 }}>
              {t("clone:destLabel")}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder={t("clone:destPlaceholder")}
                value={destDir}
                onChange={(e) => setDestDir(e.target.value)}
                disabled={cloning}
                style={{
                  flex: 1,
                  height: 34,
                  padding: "0 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--bg-app)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  outline: "none",
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                  opacity: cloning ? 0.6 : 1,
                }}
              />
              <button
                className="tb-btn"
                onClick={handleBrowse}
                disabled={cloning}
                style={{
                  height: 34,
                  padding: "0 10px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  borderRadius: 6,
                  cursor: cloning ? "default" : "pointer",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  opacity: cloning ? 0.4 : 1,
                }}
              >
                <FolderOpenIcon size={14} /> {t("clone:browse")}
              </button>
            </div>
            {/* 显示克隆后的完整路径 */}
            {url.trim() && destDir.trim() && (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, fontFamily: "monospace" }}>
                → {destDir.replace(/\\/g, "/")}/{repoName}
              </div>
            )}
          </div>

          {/* 错误信息 */}
          {error && (
            <div style={{ fontSize: 12, color: "#ef4444", padding: "8px 10px", background: "rgba(239,68,68,0.06)", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}

          {/* 成功信息 */}
          {success && (
            <div style={{ fontSize: 12, color: "#22c55e", padding: "8px 10px", background: "rgba(34,197,94,0.06)", borderRadius: 6, border: "1px solid rgba(34,197,94,0.2)" }}>
              {t("clone:success")} → {destDir.replace(/\\/g, "/")}/{repoName}
            </div>
          )}

          {/* 进度条 */}
          {cloning && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                <span>{t(`clone:stage.${stage}`, stage)}</span>
                <span>{progress}%</span>
              </div>
              <div style={{ height: 6, background: "var(--bg-app)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border-soft)" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: "var(--git-orange)",
                    borderRadius: 3,
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "10px 16px",
            borderTop: "1px solid var(--border-soft)",
          }}
        >
          {success ? (
            <button
              className="tb-btn"
              onClick={handleClose}
              style={{
                height: 32,
                padding: "0 16px",
                border: "1px solid var(--git-orange)",
                background: "var(--git-orange)",
                color: "#fff",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {t("clone:openRepo")}
            </button>
          ) : (
            <>
              <button
                className="tb-btn"
                onClick={handleClose}
                disabled={cloning}
                style={{
                  height: 32,
                  padding: "0 16px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  borderRadius: 6,
                  cursor: cloning ? "default" : "pointer",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  opacity: cloning ? 0.4 : 1,
                }}
              >
                {t("common:cancel")}
              </button>
              <button
                className="tb-btn"
                onClick={handleClone}
                disabled={cloning || !url.trim() || !destDir.trim()}
                style={{
                  height: 32,
                  padding: "0 16px",
                  border: "1px solid var(--git-orange)",
                  background: cloning ? "var(--text-tertiary)" : "var(--git-orange)",
                  color: "#fff",
                  borderRadius: 6,
                  cursor: cloning || !url.trim() || !destDir.trim() ? "default" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: !url.trim() || !destDir.trim() ? 0.4 : 1,
                }}
              >
                {cloning ? t("clone:cloning") : t("clone:clone")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
