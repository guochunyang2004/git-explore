// 共享 TS 类型（对应 src-tauri/src/types.rs）
// Rust serde rename_all = "camelCase"，TS 端用 camelCase

export interface GitRepoInfo {
  path: string;
  name: string;
  branch: string;
  ahead: number;
  behind: number;
  dirtyCount: number;
  isClean: boolean;
  remoteUrl: string | null;
  hasUpstream: boolean;
  headShort: string;
  isSubmodule: boolean;
  lastCommitMsg: string;
  lastCommitAuthor: string;
  lastCommitTime: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
  gitStatus: FileStatus | null;
  lastCommit: CommitRef | null;
}

export interface CommitRef {
  hash: string;
  message: string;
  author: string;
  time: number;
}

export interface FileStatus {
  code: StatusCode;
  staged: boolean;
}

export type StatusCode = "modified" | "added" | "deleted" | "untracked" | "conflict" | "renamed";

export interface BatchTask {
  id: string;
  repoPath: string;
  repoName: string;
  branch: string;
  state: BatchState;
  stage: string;
  percent: number;
  message: string;
  startedAt: number | null;
  finishedAt: number | null;
}

export type BatchState = "queued" | "running" | "success" | "failed" | "skipped" | "conflict" | "cancelled";

export interface BatchResult {
  batchId: string;
  op: BatchOp;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  conflict: number;
  tasks: BatchTask[];
}

export type BatchOp = "pull" | "push" | "fetch" | "sync" | "commit" | "switchbranch";

export interface GitContext {
  repoPath: string;
  repoName: string;
  branch: string;
}

export interface ListResult {
  entries: FileEntry[];
  gitContext: GitContext | null;
}

export interface Branch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream: string | null;
}

// AppError（附录 B.5）
export interface AppError {
  code: ErrorCode;
  message: string;
  messageKey: string;
  params: Record<string, string>;
  detail: string | null;
}

export type ErrorCode =
  | "notFound"
  | "notAGitRepo"
  | "authFailed"
  | "networkError"
  | "conflict"
  | "invalidPath"
  | "gitError"
  | "cancelled"
  | "internal";
