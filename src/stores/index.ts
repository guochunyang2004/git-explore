// 全局状态 stores（Zustand + IPC 集成）
// 对应架构文档 4.6 数据流
// IPC 导入使用动态 import，避免 Tauri API 在浏览器 dev 模式报错

import { create } from "zustand";
import type { FileEntry, GitContext, GitRepoInfo, BatchTask, BatchState, ListResult } from "@/types";

const loadIpc = () => import("@/ipc");

/// 磁盘信息
export interface DriveInfo {
  path: string;
  name: string;
}

// ============ 工作区 store ============
interface WorkspaceState {
  rootPath: string | null;
  recentRoots: string[];
  currentDir: string | null;
  entries: FileEntry[];          // 右侧列表数据源（navigateTo 时更新）
  treeEntries: FileEntry[];      // 左侧树顶层节点数据源（openWorkspace 时设置，不随导航变化）
  gitContext: GitContext | null;
  loading: boolean;
  selectedEntry: string | null;
  drives: DriveInfo[];        // 本机磁盘列表
  // Navigation history
  historyStack: string[];   // 历史路径栈
  historyIndex: number;     // 当前在历史栈中的位置
  canGoBack: boolean;       // 是否可后退
  canGoUp: boolean;         // 是否可返回上级目录
  // 树展开状态
  expandedPaths: Set<string>;  // 已展开的目录路径集合
  treeChildren: Map<string, FileEntry[]>;  // 子目录懒加载缓存
  // Actions (getter-only)
  setRoot: (path: string | null) => void;
  setRecentRoots: (roots: string[]) => void;
  setCurrentDir: (dir: string | null) => void;
  setEntries: (entries: FileEntry[], ctx: GitContext | null) => void;
  setTreeEntries: (entries: FileEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setSelected: (path: string | null) => void;
  setDrives: (drives: DriveInfo[]) => void;
  // Actions (side-effect / IPC)
  loadDrives: () => Promise<void>;
  openWorkspace: (path: string) => Promise<void>;
  navigateTo: (dirPath: string) => Promise<void>;
  loadRecents: () => Promise<void>;
  goBack: () => Promise<void>;
  goUp: () => Promise<void>;
  goHome: () => void;       // 回到磁盘列表初始状态
  // 树展开
  toggleExpand: (dirPath: string) => Promise<void>;
  isExpanded: (dirPath: string) => boolean;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  recentRoots: [],
  currentDir: null,
  entries: [],
  treeEntries: [],
  gitContext: null,
  loading: false,
  selectedEntry: null,
  drives: [],
  historyStack: [],
  historyIndex: -1,
  canGoBack: false,
  canGoUp: false,
  expandedPaths: new Set<string>(),
  treeChildren: new Map<string, FileEntry[]>(),

  setRoot: (path) => set({ rootPath: path }),
  setRecentRoots: (roots) => set({ recentRoots: roots }),
  setCurrentDir: (dir) => set({ currentDir: dir }),
  setEntries: (entries, ctx) => set({ entries, gitContext: ctx }),
  setTreeEntries: (entries) => set({ treeEntries: entries }),
  setLoading: (loading) => set({ loading }),
  setSelected: (path) => set({ selectedEntry: path }),
  setDrives: (drives) => set({ drives }),

  /** 加载本机磁盘列表 */
  loadDrives: async () => {
    try {
      const ipc = await loadIpc();
      const drives = await ipc.listDrives();
      set({ drives });
    } catch (e) {
      console.error("loadDrives failed:", e);
    }
  },

  /** 回到磁盘列表初始状态 */
  goHome: () => {
    set({
      rootPath: null,
      currentDir: null,
      entries: [],
      treeEntries: [],
      gitContext: null,
      selectedEntry: null,
      loading: false,
      historyStack: [],
      historyIndex: -1,
      canGoBack: false,
      canGoUp: false,
    });
  },

  /** 打开根目录：调用 workspace_open IPC，历史栈以 home 为起点 */
  openWorkspace: async (rootPath: string) => {
    set({ loading: true, rootPath, currentDir: rootPath, selectedEntry: rootPath });
    try {
      const ipc = await loadIpc();
      const entries = await ipc.workspaceOpen(rootPath);

      // 构建路径链: D:\gitee\gcy => ["D:\\", "D:\\gitee", "D:\\gitee\\gcy"]
      const pathChain: string[] = [];
      const normalized = rootPath.replace(/[\\/]+$/, "");
      const driveMatch = /^([A-Za-z]:)([\\/].*)?$/.exec(normalized);
      if (driveMatch) {
        const driveRoot = driveMatch[1] + "\\";
        pathChain.push(driveRoot);
        const rest = driveMatch[2] || "";
        const parts = rest.split(/[\\/]/).filter(Boolean);
        let acc = driveRoot;
        for (const p of parts) {
          acc = acc + (acc.endsWith("\\") ? "" : "\\") + p;
          pathChain.push(acc);
        }
      }

      // 预加载路径链每一级的子目录到 treeChildren
      const treeChildren = new Map<string, FileEntry[]>();
      const expandedPaths = new Set<string>();
      // "此电脑" 虚拟根节点始终展开
      expandedPaths.add("");
      // 磁盘列表作为 "此电脑" 的子节点（treeEntries）
      const state = get();
      const allDriveEntries: FileEntry[] = state.drives.length > 0
        ? state.drives.map((d) => ({
            name: d.name,
            path: d.path,
            isDir: true,
            size: 0,
            modified: 0,
            gitStatus: null,
            lastCommit: null,
          }))
        : [];
      // "此电脑" 子节点缓存
      treeChildren.set("", allDriveEntries);
      // 加载磁盘根目录内容并自动展开
      if (driveMatch) {
        const driveRoot = driveMatch[1] + "\\";
        expandedPaths.add(driveRoot);
        try {
          const driveChildren = await ipc.workspaceTreeExpand(driveRoot);
          treeChildren.set(driveRoot, driveChildren);
        } catch {}
      }
      // 沿路径链加载每一级
      for (let i = 1; i < pathChain.length; i++) {
        const parent = pathChain[i - 1];
        const current = pathChain[i];
        expandedPaths.add(current);
        // 加载 parent 的子目录（如果还没加载）
        if (!treeChildren.has(parent)) {
          try {
            const children = await ipc.workspaceTreeExpand(parent);
            treeChildren.set(parent, children);
          } catch {}
        }
      }
      // 工作区根目录内容也加载到 treeChildren
      treeChildren.set(rootPath, entries);

      set({
        entries,
        treeEntries: allDriveEntries,
        loading: false,
        historyStack: ["", rootPath],
        historyIndex: 1,
        canGoBack: true,
        canGoUp: true,
        expandedPaths,
        treeChildren,
      });
    } catch (e) {
      console.error("openWorkspace failed:", e);
      set({ loading: false, entries: [] });
    }
  },

  /** 导航到子目录：调用 workspace_list IPC，压入历史栈 */
  navigateTo: async (dirPath: string) => {
    const state = get();
    // 检查是否为后退（目标路径在历史栈的前一个位置）
    const isBack = state.historyIndex > 0 &&
      state.historyStack[state.historyIndex - 1] === dirPath;
    // 如果后退到 home（空字符串），直接调用 goHome
    if (isBack && dirPath === "") {
      get().goHome();
      return;
    }
    set({ loading: true, currentDir: dirPath, selectedEntry: dirPath });
    try {
      const ipc = await loadIpc();
      const result: ListResult = await ipc.workspaceList(dirPath);
      // 更新历史栈
      let newStack = state.historyStack;
      let newIndex = state.historyIndex;
      if (isBack) {
        // 后退：仅移动 index，不截断历史
        newIndex = state.historyIndex - 1;
      } else {
        // 正常导航（含向上）：截断当前位置之后的历史，压入新路径
        newStack = [...state.historyStack.slice(0, state.historyIndex + 1), dirPath];
        newIndex = newStack.length - 1;
      }
      // 统一计算 canGoBack 和 canGoUp
      const rootPath = state.rootPath;
      const canBack = newIndex > 0;
      // canGoUp: 当前路径比根目录深，或者当前就是根目录且有 home 可以回去
      // 额外: 驱动器根目录 (E:\) 也可以向上回到此电脑
      const hasHome = newStack[0] === "";
      const isDriveRoot = /^[A-Za-z]:[\\/]$/.test(dirPath);
      const canUp = dirPath !== "" && (
        (rootPath !== null && dirPath !== rootPath && dirPath.length > rootPath.length)
          ? true
          : (rootPath !== null && dirPath === rootPath && hasHome)
            ? true
            : isDriveRoot && hasHome
      );
      set({
        entries: result.entries,
        gitContext: result.gitContext ?? null,
        loading: false,
        historyStack: newStack,
        historyIndex: newIndex,
        canGoBack: canBack,
        canGoUp: canUp,
      });
    } catch (e) {
      console.error("navigateTo failed:", e);
      set({ loading: false });
    }
  },

  /** 后退到上一个历史路径 */
  goBack: async () => {
    const state = get();
    if (state.historyIndex <= 0) return;
    const targetDir = state.historyStack[state.historyIndex - 1];
    if (targetDir === "") {
      // 后退到 home（磁盘列表）
      get().goHome();
      return;
    }
    // 统一走 navigateTo，它会识别为后退并正确处理
    await state.navigateTo(targetDir);
  },

  /** 返回上级目录 */
  goUp: async () => {
    const state = get();
    if (!state.currentDir) return;
    // 如果当前就在根目录，向上回到 home（磁盘列表 / 此电脑）
    if (state.rootPath && state.currentDir === state.rootPath) {
      get().goHome();
      return;
    }
    if (!state.rootPath) return;
    // 计算上级目录
    const current = state.currentDir;
    const sep = current.includes("\\") ? "\\" : "/";
    // 处理 UNC 路径 \\server\share\...
    if (current.startsWith("\\\\") || current.startsWith("//")) {
      const parts = current.split(sep).filter(Boolean);
      if (parts.length <= 2) return; // UNC 根 server\share，不再向上
      parts.pop();
      const parent = sep + sep + parts.join(sep);
      if (parent === state.currentDir) return;
      await state.navigateTo(parent);
      return;
    }
    // 普通路径如 E:\face\sub
    // 当前已经是驱动器根目录 E:\ — 向上回到此电脑
    if (/^[A-Za-z]:[\\/]+$/.test(current)) {
      get().goHome();
      return;
    }
    // 用 PathBuf 式逻辑：取 parent
    const trimmed = current.replace(/[\\/]+$/, ""); // 去掉末尾分隔符
    const lastSep = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
    if (lastSep <= 0) return;
    // 驱动器根目录: E:\ — 再向上回到此电脑
    if (lastSep === 2 && /^[A-Za-z]:[\/]/.test(trimmed)) {
      // 当前是 E:\face，上级是 E:\
      const parent = trimmed.substring(0, 3); // E:\
      if (parent === state.currentDir) return;
      await state.navigateTo(parent);
      return;
    }
    // 当前已经是 E:\ （驱动器根），向上回到此电脑
    if (/^[A-Za-z]:[\\/]$/.test(trimmed)) {
      get().goHome();
      return;
    }
    // 普通子目录: E:\face\sub -> E:\face
    const parent = trimmed.substring(0, lastSep);
    if (parent === state.currentDir) return;
    await state.navigateTo(parent);
  },

  /** 加载最近打开列表 */
  loadRecents: async () => {
    try {
      const ipc = await loadIpc();
      const roots = await ipc.workspaceRecent();
      set({ recentRoots: roots });
    } catch {
      // 静默失败（开发模式或首次运行）
    }
  },

  /** 切换树节点展开/折叠 */
  toggleExpand: async (dirPath: string) => {
    const state = get();
    const expanded = new Set(state.expandedPaths);
    if (expanded.has(dirPath)) {
      expanded.delete(dirPath);
      set({ expandedPaths: expanded });
    } else {
      // 特殊处理："" = "此电脑"节点，子节点是磁盘列表
      if (dirPath === "") {
        if (!state.treeChildren.has("")) {
          const driveEntries: FileEntry[] = state.drives.map((d) => ({
            name: d.name,
            path: d.path,
            isDir: true,
            size: 0,
            modified: 0,
            gitStatus: null,
            lastCommit: null,
          }));
          const treeChildren = new Map(state.treeChildren);
          treeChildren.set("", driveEntries);
          expanded.add("");
          set({ expandedPaths: expanded, treeChildren });
        } else {
          expanded.add("");
          set({ expandedPaths: expanded });
        }
        return;
      }
      // 懒加载子目录
      if (!state.treeChildren.has(dirPath)) {
        try {
          const ipc = await loadIpc();
          const children = await ipc.workspaceTreeExpand(dirPath);
          const treeChildren = new Map(state.treeChildren);
          treeChildren.set(dirPath, children);
          expanded.add(dirPath);
          set({ expandedPaths: expanded, treeChildren });
        } catch (e) {
          console.error("toggleExpand failed:", e);
        }
      } else {
        expanded.add(dirPath);
        set({ expandedPaths: expanded });
      }
    }
  },

  /** 检查路径是否已展开 */
  isExpanded: (dirPath: string) => {
    return get().expandedPaths.has(dirPath);
  },
}));

// ============ Git 仓库识别 store ============
interface GitReposState {
  repos: GitRepoInfo[];
  setRepos: (repos: GitRepoInfo[]) => void;
  mergeRepos: (newRepos: GitRepoInfo[]) => void;  // 合并扫描结果（去重，按 path 覆盖）
  upsertRepo: (repo: GitRepoInfo) => void;
  removeRepo: (path: string) => void;
}

export const useGitReposStore = create<GitReposState>((set) => ({
  repos: [],
  setRepos: (repos) => set({ repos }),
  mergeRepos: (newRepos) =>
    set((s) => {
      const existingPaths = new Set(newRepos.map((r) => r.path));
      const kept = s.repos.filter((r) => !existingPaths.has(r.path));
      return { repos: [...kept, ...newRepos] };
    }),
  upsertRepo: (repo) =>
    set((s) => ({
      repos: [
        ...s.repos.filter((r) => r.path !== repo.path),
        repo,
      ],
    })),
  removeRepo: (path) =>
    set((s) => ({ repos: s.repos.filter((r) => r.path !== path) })),
}));

// ============ 批量选择 store ============
interface BatchSelectionState {
  batchMode: boolean;
  selectedRepos: Set<string>;
  toggleBatchMode: () => void;
  setBatchMode: (on: boolean) => void;
  toggleRepo: (path: string) => void;
  selectAll: (paths: string[]) => void;
  clearAll: () => void;
}

export const useBatchSelectionStore = create<BatchSelectionState>((set) => ({
  batchMode: false,
  selectedRepos: new Set<string>(),
  toggleBatchMode: () => set((s) => ({ batchMode: !s.batchMode })),
  setBatchMode: (on) => set({ batchMode: on }),
  toggleRepo: (path) =>
    set((s) => {
      const next = new Set(s.selectedRepos);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { selectedRepos: next };
    }),
  selectAll: (paths) => set({ selectedRepos: new Set(paths) }),
  clearAll: () => set({ selectedRepos: new Set<string>() }),
}));

// ============ 批量进度 store ============
interface BatchProgressState {
  visible: boolean;
  batchId: string | null;
  tasks: BatchTask[];
  setVisible: (v: boolean) => void;
  setBatch: (id: string, tasks: BatchTask[]) => void;
  updateTask: (repoPath: string, patch: Partial<BatchTask>) => void;
  reset: () => void;
}

export const useBatchProgressStore = create<BatchProgressState>((set) => ({
  visible: false,
  batchId: null,
  tasks: [],
  setVisible: (v) => set({ visible: v }),
  setBatch: (id, tasks) => set({ batchId: id, tasks, visible: true }),
  updateTask: (repoPath, patch) =>
    set((s) => {
      const idx = s.tasks.findIndex((t) => t.repoPath === repoPath);
      if (idx >= 0) {
        const next = [...s.tasks];
        next[idx] = { ...next[idx], ...patch };
        return { tasks: next };
      }
      // 新任务：创建并插入
      const newTask: BatchTask = {
        id: repoPath,
        repoPath,
        repoName: repoPath.split(/[/\\]/).pop() || repoPath,
        branch: "",
        state: (patch.state as BatchState) || "queued",
        stage: patch.stage || "",
        percent: patch.percent || 0,
        message: patch.message || "",
        startedAt: null,
        finishedAt: null,
      };
      return { tasks: [...s.tasks, newTask] };
    }),
  reset: () => set({ visible: false, batchId: null, tasks: [] }),
}));

// ============ Git 扫描 store ============
interface ScanState {
  scanning: boolean;
  scanRoot: string | null;
  scanCancelled: boolean;
  setScanning: (v: boolean, root?: string | null) => void;
  setScanCancelled: (v: boolean) => void;
}

export const useScanStore = create<ScanState>((set) => ({
  scanning: false,
  scanRoot: null,
  scanCancelled: false,
  setScanning: (v, root) => set({ scanning: v, scanRoot: root ?? null, scanCancelled: false }),
  setScanCancelled: (v) => set({ scanCancelled: v }),
}));

// ============ 配置 store ============
interface ConfigState {
  autoScanGit: boolean;
  setAutoScanGit: (v: boolean) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  autoScanGit: false,
  setAutoScanGit: (v) => set({ autoScanGit: v }),
}));
