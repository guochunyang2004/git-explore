// 自定义标题栏（Tauri 无边框窗口，对应架构文档 4.6）

import { getCurrentWindow } from "@tauri-apps/api/window";
import { GitBranchIcon, MinimizeIcon, MaximizeIcon, CloseIcon } from "@/components/icons";
import { useWorkspaceStore } from "@/stores";

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const rootPath = useWorkspaceStore((s) => s.rootPath);

  return (
    <div
      data-tauri-drag-region
      style={{
        height: "var(--titlebar-h)",
        background: "var(--bg-titlebar)",
        display: "flex",
        alignItems: "center",
        padding: "0 0 0 12px",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <div
        data-tauri-drag-region
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          marginRight: 8,
          flexShrink: 0,
          background: "linear-gradient(135deg, var(--git-orange), #ff7a4d)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <GitBranchIcon size={11} style={{ color: "#fff", strokeWidth: 2.4 }} />
      </div>
      <div
        data-tauri-drag-region
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: ".2px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        GitExplore
        <span
          data-tauri-drag-region
          style={{ color: "var(--text-tertiary)", margin: "0 6px", fontWeight: 400 }}
        >
          —
        </span>
        <span
          data-tauri-drag-region
          style={{
            color: "var(--text-secondary)",
            fontWeight: 400,
            fontFamily: "'Cascadia Code','Consolas',monospace",
          }}
        >
          {rootPath ?? ""}
        </span>
      </div>
      <div data-tauri-drag-region style={{ flex: 1 }} />
      <div
        style={{
          display: "flex",
          height: "100%",
        }}
      >
        <button
          className="titlebar-btn"
          onClick={() => appWindow.minimize()}
          title="最小化"
        >
          <MinimizeIcon size={11} />
        </button>
        <button
          className="titlebar-btn"
          onClick={() => appWindow.toggleMaximize()}
          title="最大化"
        >
          <MaximizeIcon size={11} />
        </button>
        <button
          className="titlebar-btn close"
          onClick={() => appWindow.close()}
          title="关闭"
        >
          <CloseIcon size={11} />
        </button>
      </div>
    </div>
  );
}
