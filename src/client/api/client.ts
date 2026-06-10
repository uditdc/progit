import type {
  CheckoutBody,
  CommitBody,
  CommitDiffPayload,
  CreateBranchBody,
  CreateTagBody,
  CredentialAnswerBody,
  FetchBody,
  LogPayload,
  PushBody,
  RefsPayload,
  RepoInfo,
  StagePathsBody,
  StatusPayload,
  WorkingDiffPayload,
  Worktree,
} from '../../shared/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `${res.status} ${res.statusText}`);
  }
  return body as T;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Every endpoint is repo-scoped via ?path= (ungit-style multi-repo server). */
function q(path: string, extra?: Record<string, string>): string {
  return new URLSearchParams({ path, ...extra }).toString();
}

export const api = {
  repo: (path: string) => request<RepoInfo>(`/api/repo?${q(path)}`),
  log: (path: string, limit: number) => request<LogPayload>(`/api/log?${q(path, { limit: String(limit) })}`),
  logStats: (path: string, limit: number) =>
    request<Record<string, { add: number; del: number }>>(`/api/log/stats?${q(path, { limit: String(limit) })}`),
  refs: (path: string) => request<RefsPayload>(`/api/refs?${q(path)}`),
  status: (path: string, worktree?: string) =>
    request<StatusPayload>(`/api/status?${q(path, worktree ? { worktree } : undefined)}`),
  worktrees: (path: string) => request<Worktree[]>(`/api/worktrees?${q(path)}`),
  commitDiff: (path: string, sha: string) => request<CommitDiffPayload>(`/api/diff/commit/${sha}?${q(path)}`),
  workingDiff: (path: string, worktree?: string) =>
    request<WorkingDiffPayload>(`/api/diff/working?${q(path, worktree ? { worktree } : undefined)}`),
  checkout: (path: string, body: CheckoutBody) => post<{ ok: true }>(`/api/checkout?${q(path)}`, body),
  createBranch: (path: string, body: CreateBranchBody) => post<{ ok: true }>(`/api/branches?${q(path)}`, body),
  createTag: (path: string, body: CreateTagBody) => post<{ ok: true }>(`/api/tags?${q(path)}`, body),
  stage: (path: string, body: StagePathsBody) => post<{ ok: true }>(`/api/stage?${q(path)}`, body),
  unstage: (path: string, body: StagePathsBody) => post<{ ok: true }>(`/api/unstage?${q(path)}`, body),
  commit: (path: string, body: CommitBody) => post<{ ok: true }>(`/api/commit?${q(path)}`, body),
  uncommit: (path: string) => post<{ ok: true }>(`/api/uncommit?${q(path)}`, {}),
  fetchRemote: (path: string, body: FetchBody) => post<{ ok: true }>(`/api/fetch?${q(path)}`, body),
  push: (path: string, body: PushBody) => post<{ ok: true; setUpstream?: boolean }>(`/api/push?${q(path)}`, body),
  pull: (path: string) => post<{ ok: true }>(`/api/pull?${q(path)}`, {}),
  answerCredential: (body: CredentialAnswerBody) => post<{ ok: true }>('/api/credentials', body),
};
