// 应用顶层布局（Windows 11 Explorer 风格，对应架构文档 3.1 表现层）
import { useEffect, useRef, useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { MenuBar } from "@/components/MenuBar";
import { ToolBar } from "@/components/ToolBar";
import { BatchActionBar } from "@/components/BatchActionBar";
import { AddressBar } from "@/components/AddressBar";
import { FileTree } from "@/components/FileTree";
import { FileList } from "@/components/FileList";
import { BatchProgressPanel } from "@/components/BatchProgressPanel";
import { StatusBar } from "@/components/StatusBar";
import { SettingsDialog, applyRepoColor } from "@/components/SettingsDialog";
import { useBatchSelectionStore, useBatchProgressStore, useWorkspaceStore, useConfigStore } from "@/stores";
import { useAppInit } from "@/hooks/useAppInit";
import { configGet } from "@/ipc";

export function App() {
  const selectedCount = useBatchSelectionStore((s) => s.selectedRepos.size);
  const batchVisible = useBatchProgressStore((s) => s.visible);
  const loadRecents = useWorkspaceStore((s) => s.loadRecents);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 注册后端事件监听
  useAppInit();

  // 启动时加载磁盘列表 + 最近打开记录
  const loadDrives = useWorkspaceStore((s) => s.loadDrives);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadRecents();
    loadDrives();
    // 启动时从配置加载仓库颜色 + 自动扫描设置
    configGet().then((cfg) => {
      if (cfg.repoColor) applyRepoColor(cfg.repoColor);
      useConfigStore.getState().setAutoScanGit(cfg.autoScanGit);
    }).catch(() => {});
  }, []);

  return (
    <div className="app-window">
      {/* 标题栏 */}
      <TitleBar />

      {/* 菜单栏 */}
      <MenuBar />

      {/* 工具栏 */}
      <ToolBar onSettings={() => setSettingsOpen(true)} />

      {/* 设置对话框 */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* 批量操作栏（勾选仓库后浮现） */}
      {selectedCount > 0 && <BatchActionBar />}

      {/* 地址栏 */}
      <AddressBar />

      {/* 内容区：左侧文件树 + 右侧文件列表 */}
      <div className="content-area">
        <div className="sidebar-pane">
          <FileTree />
        </div>
        <div className="main-pane">
          <FileList />
        </div>
      </div>

      {/* 批量进度面板（执行批量操作时浮现） */}
      {batchVisible && <BatchProgressPanel />}

      {/* 状态栏 */}
      <StatusBar />
    </div>
  );
}
