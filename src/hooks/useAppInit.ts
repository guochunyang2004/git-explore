// 应用初始化 hook：注册 Tauri 事件监听器
// 在 App 挂载时执行一次，连接后端事件 → 前端 stores
import { useEffect } from "react";
import { onEvent } from "@/ipc";
import { useGitReposStore, useBatchProgressStore, useScanStore, useSizeScanStore } from "@/stores";
import type { GitRepoInfo, BatchTask } from "@/types";

// 事件载荷类型（与 Rust events.rs 对齐）
interface BatchSummary { success: number; failed: number; skipped: number; conflict: number; }
interface ReposDetectedPayload {
  repos: GitRepoInfo[];
}

interface BatchStartedPayload {
  batchId: string;
  op: string;
  total: number;
}

interface BatchRepoProgressPayload {
  batchId: string;
  repoPath: string;
  stage: string;
  percent: number;
}

interface BatchRepoDonePayload {
  batchId: string;
  repoPath: string;
  success: boolean;
  message: string;
}

interface BatchCompletedPayload {
  batchId: string;
  summary: BatchSummary;
}

export function useAppInit() {
  const setRepos = useGitReposStore((s) => s.setRepos);
  const mergeRepos = useGitReposStore((s) => s.mergeRepos);
  const setBatch = useBatchProgressStore((s) => s.setBatch);
  const updateTask = useBatchProgressStore((s) => s.updateTask);
  const reset = useBatchProgressStore((s) => s.reset);
  const setScanning = useScanStore((s) => s.setScanning);
  const setScanCancelled = useScanStore((s) => s.setScanCancelled);
  const setScanProgress = useScanStore((s) => s.setScanProgress);
  const upsertRepo = useGitReposStore((s) => s.upsertRepo);
  // 大小扫描
  const setSizeScanning = useSizeScanStore((s) => s.setSizeScanning);
  const setSizeScanCancelled = useSizeScanStore((s) => s.setSizeScanCancelled);
  const setSizeScanProgress = useSizeScanStore((s) => s.setSizeScanProgress);
  const setDirSize = useSizeScanStore((s) => s.setDirSize);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    // 1. Git 仓库识别完成 — 合并到现有仓库列表（支持子目录增量扫描）
    onEvent<ReposDetectedPayload>("git:repos-detected", (payload) => {
      mergeRepos(payload.repos);
      setScanning(false);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 1b. Git 扫描开始
    onEvent<{ rootPath: string }>("git:scan-started", (payload) => {
      setScanning(true, payload.rootPath);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 1c. Git 扫描取消/失败
    onEvent<{ rootPath: string; found: number }>("git:scan-cancelled", () => {
      setScanning(false);
      setScanCancelled(true);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 1d. Git 扫描进度（实时）
    onEvent<{ rootPath: string; scannedDirs: number; foundRepos: number; currentDir: string }>("git:scan-progress", (payload) => {
      setScanProgress(payload.scannedDirs, payload.foundRepos, payload.currentDir);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 1e. 单个 Git 仓库被发现（实时）
    onEvent<{ repo: GitRepoInfo }>("git:repo-found", (payload) => {
      upsertRepo(payload.repo);
    }).then((unlisten) => unlisteners.push(unlisten));

    // === 大小扫描事件 ===
    // 2a. 大小扫描开始
    onEvent<{ rootPath: string }>("size:scan-started", (payload) => {
      setSizeScanning(true, payload.rootPath);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 2b. 大小扫描进度
    onEvent<{ rootPath: string; scannedDirs: number; scannedFiles: number; currentDir: string }>("size:scan-progress", (payload) => {
      setSizeScanProgress(payload.scannedDirs, payload.scannedFiles, payload.currentDir);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 2c. 单个目录大小已算出
    onEvent<{ path: string; size: number; fileCount: number; dirCount: number }>("size:entry-updated", (payload) => {
      setDirSize(payload.path, payload.size, payload.fileCount, payload.dirCount);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 2d. 大小扫描取消/完成
    onEvent<{ rootPath: string; scanned: number }>("size:scan-cancelled", () => {
      setSizeScanning(false);
      setSizeScanCancelled(true);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 2. 批量操作启动 — 初始化空任务列表（任务通过 batch:repo-progress 逐个接收）
    onEvent<BatchStartedPayload>("batch:started", (payload) => {
      // 用 total 初始化占位任务
      const tasks: BatchTask[] = [];
      // 实际任务在 batch:repo-progress 中逐个填充，此处仅设置 panel 可见
      setBatch(payload.batchId, tasks);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 3. 批量单仓进度
    onEvent<BatchRepoProgressPayload>("batch:repo-progress", (payload) => {
      updateTask(payload.repoPath, {
        stage: payload.stage,
        percent: payload.percent,
        state: "running",
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    // 4. 批量单仓完成
    onEvent<BatchRepoDonePayload>("batch:repo-done", (payload) => {
      updateTask(payload.repoPath, {
        state: payload.success ? "success" : "failed",
        message: payload.message,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    // 5. 批量全部完成
    onEvent<BatchCompletedPayload>("batch:completed", (_payload) => {
      // 不立即 reset，保留面板让用户看到最终结果
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [setRepos, mergeRepos, upsertRepo, setBatch, updateTask, reset, setScanning, setScanCancelled, setScanProgress, setSizeScanning, setSizeScanCancelled, setSizeScanProgress, setDirSize]);
}
