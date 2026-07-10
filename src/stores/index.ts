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
      // 历史栈: [""(home), rootPath] — 根目录时 canGoBack=true, canGoUp=true
      set({
        entries,
        treeEntries: entries,  // 左侧树顶层节点 = 根目录内容（不随导航变化）
        loading: false,
        historyStack: ["", rootPath],
        historyIndex: 1,
        canGoBack: true,
        canGoUp: true,
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
      // canGoUp: 当前不在 home 且（有根目录且路径长于根目录，或无根目录限制）
      const rootPath = state.rootPath;
      const canBack = newIndex > 0;
      // canGoUp: 当前路径比根目录深，或者历史栈底部有 home（可以从根目录回到磁盘列表）
      const hasHome = newStack[0] === "";
      const canUp = dirPath !== "" && (
        rootPath !== null && dirPath !== rootPath && dirPath.length > rootPath.length
          ? true
          : rootPath !== null && dirPath === rootPath && hasHome
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
    // 如果当前就在根目录，向上回到 home（磁盘列表）
    if (state.rootPath && state.currentDir === state.rootPath) {
      get().goHome();
      return;
    }
    if (!state.rootPath) return;
    // 计算上级目录
    const current = state.currentDir;
    const sep = current.includes("\\") ? "\\" : "/";
    const parts = current.split(sep).filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    const parent = current.startsWith("\\\\") || current.startsWith("//")
      ? sep + sep + parts.join(sep)
      : (current.match(/^[A-Z]:/)?.[0] || "") + sep + parts.join(sep);
    if (parent === state.currentDir) return;
    // 统一走 navigateTo，作为正常导航压栈
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
