import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useRepo() {
  return useQuery({ queryKey: ['repo'], queryFn: api.repo });
}

export function useLog(limit: number) {
  return useQuery({ queryKey: ['log', limit], queryFn: () => api.log(limit), placeholderData: (prev) => prev });
}

export function useLogStats(limit: number) {
  return useQuery({
    queryKey: ['log', 'stats', limit],
    queryFn: () => api.logStats(limit),
    placeholderData: (prev) => prev,
  });
}

export function useRefs() {
  return useQuery({ queryKey: ['refs'], queryFn: api.refs });
}

export function useStatus() {
  return useQuery({ queryKey: ['status'], queryFn: () => api.status() });
}

export function useWorktrees() {
  return useQuery({ queryKey: ['worktrees'], queryFn: api.worktrees });
}

export function useCommitDiff(sha: string | null) {
  return useQuery({
    queryKey: ['diff', 'commit', sha],
    queryFn: () => api.commitDiff(sha!),
    enabled: sha !== null,
  });
}

export function useWorkingDiff(enabled: boolean, worktree?: string) {
  return useQuery({
    queryKey: ['diff', 'working', worktree ?? null],
    queryFn: () => api.workingDiff(worktree),
    enabled,
  });
}

export interface MutationCallbacks {
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

function useGitMutation<TArgs>(
  fn: (args: TArgs) => Promise<unknown>,
  successMsg: (args: TArgs) => string,
  cb: MutationCallbacks,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, args) => cb.onSuccess?.(successMsg(args)),
    onError: (err) => cb.onError?.(err instanceof Error ? err.message : String(err)),
    onSettled: () => qc.invalidateQueries(),
  });
}

export function useGitActions(cb: MutationCallbacks) {
  const checkout = useGitMutation(api.checkout, (a) => `Checked out ${a.ref}`, cb);
  const createBranch = useGitMutation(
    api.createBranch,
    (a) => `Created branch ${a.name}${a.checkout ? ' · checked out' : ''}`,
    cb,
  );
  const createTag = useGitMutation(api.createTag, (a) => `Created tag ${a.name}`, cb);
  const stage = useGitMutation(api.stage, (a) => (a.paths.length > 1 ? `Staged ${a.paths.length} files` : `Staged ${a.paths[0]}`), cb);
  const unstage = useGitMutation(
    api.unstage,
    (a) => (a.paths.length > 1 ? `Unstaged ${a.paths.length} files` : `Unstaged ${a.paths[0]}`),
    cb,
  );
  const commit = useGitMutation(api.commit, () => 'Committed staged changes', cb);
  return { checkout, createBranch, createTag, stage, unstage, commit };
}
