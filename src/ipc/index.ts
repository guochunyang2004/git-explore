// IPC 封装（对应架构文档附录 B 命令契约）
// 对 invoke 的类型安全封装

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  BatchOp,
  BatchResult,
  Branch,
  CommitRef,
  FileEntry,
  FileStatus,
  ListResult,
} from "@/types";

// ============ 工作区命令 ============

/// 磁盘信息
export interface DriveInfo {
  /** 盘符根路径，如 `C:\\` */
  path: string;
  /** 显示名称，如 `本地磁盘 (C:)` */
  name: string;
}

export const listDrives = (): Promise<DriveInfo[]> =>
  invoke("list_drives");

export const workspaceOpen = (rootPath: string): Promise<FileEntry[]> =>
  invoke("workspace_open", { rootPath });

export const workspaceList = (dirPath: string): Promise<ListResult> =>
  invoke("workspace_list", { dirPath });

export const workspaceRecent = (): Promise<string[]> =>
  invoke("workspace_recent");

export const workspaceTreeExpand = (dirPath: string): Promise<FileEntry[]> =>
  invoke("workspace_tree_expand", { dirPath });

// ============ Git 扫描命令 ============

export const scanGitRepos = (rootPath: string, depth?: number): Promise<void> =>
  invoke("scan_git_repos", { rootPath, depth });

export const scanCancel = (): Promise<void> =>
  invoke("scan_cancel");

// ============ Git 单库命令 ============
export const gitStatus = (repoPath: string): Promise<FileStatus[]> =>
  invoke("git_status", { repoPath });

export const gitLog = (
  repoPath: string,
  branch: string | null,
  page: number,
  pageSize: number
): Promise<CommitRef[]> =>
  invoke("git_log", { repoPath, branch, page, pageSize });

export const gitBranches = (repoPath: string): Promise<Branch[]> =>
  invoke("git_branches", { repoPath });

export const gitCheckout = (repoPath: string, branch: string): Promise<void> =>
  invoke("git_checkout", { repoPath, branch });

// ============ 批量命令 ============
export const batchRun = (op: BatchOp, repoPaths: string[]): Promise<string> =>
  invoke("batch_run", { op, repoPaths });

export const batchCancel = (batchId: string): Promise<void> =>
  invoke("batch_cancel", { batchId });

export const batchRetry = (batchId: string, repoPath: string): Promise<void> =>
  invoke("batch_retry", { batchId, repoPath });

export const batchStatus = (batchId: string): Promise<BatchResult | null> =>
  invoke("batch_status", { batchId });

// ============ 配置命令 ============
export interface SettingsDto {
  language: string | null;
  scanDepth: number;
  batchConcurrency: number;
  restoreLastRoot: boolean;
  repoColor: string;
}

export const configGet = (): Promise<SettingsDto> =>
  invoke("config_get");

export const configSave = (settings: SettingsDto): Promise<void> =>
  invoke("config_save", { settings });
export const fsOpenExternal = (path: string): Promise<void> =>
  invoke("fs_open_external", { path });

export const fsOpenTerminal = (path: string): Promise<void> =>
  invoke("fs_open_terminal", { path });

export const fsIgnore = (repoPath: string, pattern: string): Promise<void> =>
  invoke("fs_ignore", { repoPath, pattern });

// ============ 事件监听 ============
export function onEvent<T>(name: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(name, (e) => handler(e.payload));
}
