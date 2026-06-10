import type {
  CheckoutBody,
  CommitBody,
  CommitDiffPayload,
  CreateBranchBody,
  CreateTagBody,
  LogPayload,
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

export const api = {
  repo: () => request<RepoInfo>('/api/repo'),
  log: (limit: number) => request<LogPayload>(`/api/log?limit=${limit}`),
  logStats: (limit: number) => request<Record<string, { add: number; del: number }>>(`/api/log/stats?limit=${limit}`),
  refs: () => request<RefsPayload>('/api/refs'),
  status: (worktree?: string) =>
    request<StatusPayload>(`/api/status${worktree ? `?worktree=${encodeURIComponent(worktree)}` : ''}`),
  worktrees: () => request<Worktree[]>('/api/worktrees'),
  commitDiff: (sha: string) => request<CommitDiffPayload>(`/api/diff/commit/${sha}`),
  workingDiff: (worktree?: string) =>
    request<WorkingDiffPayload>(`/api/diff/working${worktree ? `?worktree=${encodeURIComponent(worktree)}` : ''}`),
  checkout: (body: CheckoutBody) => post<{ ok: true }>('/api/checkout', body),
  createBranch: (body: CreateBranchBody) => post<{ ok: true }>('/api/branches', body),
  createTag: (body: CreateTagBody) => post<{ ok: true }>('/api/tags', body),
  stage: (body: StagePathsBody) => post<{ ok: true }>('/api/stage', body),
  unstage: (body: StagePathsBody) => post<{ ok: true }>('/api/unstage', body),
  commit: (body: CommitBody) => post<{ ok: true }>('/api/commit', body),
};
