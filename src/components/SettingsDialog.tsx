// 设置对话框（对应架构文档 3.1 表现层）
// 语言切换、扫描深度、批量并发、启动恢复等偏好设置
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { configGet, configSave } from "@/ipc";
import type { SettingsDto } from "@/ipc";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 将仓库颜色应用到 CSS 变量 */
export function applyRepoColor(color: string) {
  const root = document.documentElement;
  root.style.setProperty("--git-orange", color);
  // 派生 soft / light 变体（透明度混合）
  root.style.setProperty("--git-orange-soft", hexToRgba(color, 0.12));
  root.style.setProperty("--git-orange-light", hexToRgba(color, 0.06));
}

/** #rrggbb → rgba(r,g,b,a) */
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const DEFAULTS: SettingsDto = {
  language: null,
  scanDepth: 3,
  batchConcurrency: 4,
  restoreLastRoot: true,
  repoColor: "#f04e23",
};

export function SettingsDialog({ open, onClose }: Props) {
  const { t, i18n } = useTranslation("settings");
  const [settings, setSettings] = useState<SettingsDto>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    configGet()
      .then(setSettings)
      .catch(() => setSettings(DEFAULTS));
  }, [open]);

  if (!open) return null;

  const update = (patch: Partial<SettingsDto>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await configSave(settings);
      // 同步语言切换
      if (settings.language) {
        i18n.changeLanguage(settings.language);
      }
      // 应用 Git 仓库颜色到 CSS 变量
      applyRepoColor(settings.repoColor);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("configSave failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setSettings(DEFAULTS);

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 30, padding: "0 8px",
    border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
    background: "var(--bg-input)", color: "var(--text-primary)",
    fontSize: 12, outline: "none",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 6, marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 10, color: "var(--text-tertiary)",
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="settings-titlebar">
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t("title")}</h3>
          <button
            className="titlebar-btn close"
            onClick={onClose}
            style={{
              border: "none", background: "none",
              cursor: "pointer", fontSize: 16, padding: "2px 6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div className="settings-body">
          {/* 语言 */}
          <div style={rowStyle}>
            <span style={labelStyle}>{t("language.label")}</span>
            <select
              style={inputStyle}
              value={settings.language ?? ""}
              onChange={(e) => update({ language: e.target.value || null })}
            >
              <option value="">{t("language.system")}</option>
              <option value="zh-CN">{t("language.zh-CN")}</option>
              <option value="en">{t("language.en")}</option>
            </select>
          </div>

          {/* 扫描深度 */}
          <div style={rowStyle}>
            <span style={labelStyle}>{t("scanDepth.label")}</span>
            <input
              type="number"
              min={1}
              max={10}
              style={inputStyle}
              value={settings.scanDepth}
              onChange={(e) => update({ scanDepth: Number(e.target.value) || 1 })}
            />
            <span style={hintStyle}>{t("scanDepth.hint")}</span>
          </div>

          {/* 批量并发数 */}
          <div style={rowStyle}>
            <span style={labelStyle}>{t("batchConcurrency.label")}</span>
            <input
              type="number"
              min={1}
              max={8}
              style={inputStyle}
              value={settings.batchConcurrency}
              onChange={(e) => update({ batchConcurrency: Number(e.target.value) || 1 })}
            />
            <span style={hintStyle}>{t("batchConcurrency.hint")}</span>
          </div>

          {/* 恢复上次目录 */}
          <div style={rowStyle}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={settings.restoreLastRoot}
                onChange={(e) => update({ restoreLastRoot: e.target.checked })}
              />
              <span style={labelStyle}>{t("restoreLastRoot.label")}</span>
            </label>
            <span style={hintStyle}>{t("restoreLastRoot.hint")}</span>
          </div>

          {/* Git 仓库颜色 */}
          <div style={rowStyle}>
            <span style={labelStyle}>{t("repoColor.label")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="color"
                value={settings.repoColor}
                onChange={(e) => update({ repoColor: e.target.value })}
                style={{
                  width: 36, height: 30, padding: 0,
                  border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                  cursor: "pointer", background: "none",
                }}
              />
              <input
                type="text"
                value={settings.repoColor}
                onChange={(e) => update({ repoColor: e.target.value })}
                style={{ ...inputStyle, width: 100, fontFamily: "monospace" }}
                placeholder="#f04e23"
              />
              {/* 预览 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: "var(--r-sm)",
                background: hexToRgba(settings.repoColor, 0.06),
                color: settings.repoColor, fontWeight: 600, fontSize: 12,
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.5 3h4l1.5 1.5H14A1.5 1.5 0 0 1 15.5 6v7A1.5 1.5 0 0 1 14 14.5H2A1.5 1.5 0 0 1 .5 13V4.5A1.5 1.5 0 0 1 2 3z" />
                </svg>
                <span>main</span>
                <span style={{
                  fontSize: 10, padding: "0 4px", borderRadius: 3,
                  background: hexToRgba(settings.repoColor, 0.12),
                }}>↑2</span>
              </div>
            </div>
            <span style={hintStyle}>{t("repoColor.hint")}</span>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="settings-footer">
          <button className="titlebar-btn ghost" onClick={handleReset}>
            {t("reset")}
          </button>
          <div style={{ flex: 1 }} />
          {saved && (
            <span style={{ fontSize: 11, color: "var(--git-green)" }}>{t("saved")}</span>
          )}
          <button
            className="titlebar-btn primary"
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 30, padding: "0 20px",
              background: "var(--accent-color)", color: "#fff",
              border: "none", borderRadius: "var(--r-sm)",
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
              fontSize: 12, fontWeight: 600,
            }}
          >
            {saving ? "..." : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
