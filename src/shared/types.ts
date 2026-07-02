/* Shared data contract between server and client. */

export interface RepoInfo {
  name: string;
  path: string;
  /** Current branch name, or null when HEAD is detached. */
  branch: string | null;
  /** HEAD commit sha (full). */
  head: string | null;
  gitVersion: string;
}

export type RefType = 'local' | 'remote' | 'tag';

export interface GitRef {
  name: string;
  type: RefType;
  /** Full sha of the commit the ref points to (peeled for annotated tags). */
  tip: string;
  /** Local branches only. */
  current?: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  upstreamGone?: boolean;
  updated?: string;
}

export interface RefsPayload {
  local: GitRef[];
  remote: GitRef[];
  tags: GitRef[];
  /** Detached HEAD sha when no branch is checked out. */
  detachedHead?: string;
}

export interface Commit {
  /** Full sha. */
  id: string;
  shortHash: string;
  parents: string[];
  author: string;
  email: string;
  /** ISO date. */
  date: string;
  msg: string;
  add?: number;
  del?: number;
  merge?: boolean;
}

export interface LogPayload {
  commits: Commit[];
  /** True when more history exists past the requested limit. */
  hasMore: boolean;
}

export type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface StatusFile {
  path: string;
  origPath?: string;
  status: FileStatus;
}

export interface StatusPayload {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: StatusFile[];
  unstaged: StatusFile[];
  untracked: StatusFile[];
  conflicted: StatusFile[];
}

export interface WordSegment {
  x: string;
  h?: boolean;
}

export interface DiffLine {
  t: 'ctx' | 'add' | 'del';
  /** Old-file line number (ctx + del). */
  o?: number;
  /** New-file line number (ctx + add). */
  n?: number;
  /** Raw line content without the +/-/space prefix. */
  c: string;
  /** Word-level segments, computed lazily on the client. */
  words?: WordSegment[];
  noNewline?: boolean;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  origPath?: string;
  lang: string;
  status: FileStatus;
  add: number;
  del: number;
  binary?: boolean;
  hunks: Hunk[];
}

export interface CommitDiffPayload {
  sha: string;
  files: FileDiff[];
}

export interface WorkingDiffPayload {
  staged: FileDiff[];
  unstaged: FileDiff[];
  untracked: FileDiff[];
}

export interface StashEntry {
  /** stash@{N} selector — stable only within a single list snapshot. */
  ref: string;
  index: number;
  sha: string;
  /** Reflog subject, e.g. "WIP on main: 1ae932b msg" or "On main: custom". */
  message: string;
  /** Branch the stash was taken from, parsed from the subject. */
  branch: string | null;
  date: string;
}

export interface Worktree {
  name: string;
  path: string;
  branch: string | null;
  head: string;
  current: boolean;
  /** Count of dirty (staged+unstaged+untracked) files. */
  dirty: number;
  bare?: boolean;
  locked?: boolean;
}

/** SSE event hint: which slice of repo state changed. */
export type ChangeScope = 'refs' | 'index' | 'worktree' | 'all';

export interface ChangeEvent {
  type: 'change';
  scope: ChangeScope;
}

/** git/ssh asked for credentials mid-operation; the UI must answer via /api/credentials. */
export interface CredentialRequestEvent {
  type: 'credential';
  id: string;
  prompt: string;
}

export type BusEvent = ChangeEvent | CredentialRequestEvent;

export interface ApiError {
  error: string;
  code?: number;
}

/* ---- request bodies ---- */

export interface CheckoutBody {
  ref: string;
}

export interface CreateBranchBody {
  name: string;
  startPoint: string;
  checkout?: boolean;
}

export interface CreateTagBody {
  name: string;
  target: string;
}

export interface StagePathsBody {
  paths: string[];
  worktree?: string;
}

export interface CommitBody {
  /** May be empty when amending — the previous message is kept. */
  message: string;
  amend?: boolean;
}

export interface FetchBody {
  /** Remote name; all remotes when omitted. */
  remote?: string;
}

export interface PushBody {
  /** Branch to push; the checked-out branch when omitted. */
  ref?: string;
}

export interface StashPushBody {
  /** Optional label; git auto-generates "WIP on <branch>…" when omitted. */
  message?: string;
  /** Stash untracked files too — defaults on, matching the app's capture-everything default. */
  includeUntracked?: boolean;
}

export interface StashRefBody {
  /** stash@{N} selector. */
  ref: string;
}

export interface CredentialAnswerBody {
  requestId: string;
  /** Empty string cancels — git sees a failed prompt. */
  value: string;
}

export const REF_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
