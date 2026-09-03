import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  ChangeScope,
  CheckoutBody,
  CommitBody,
  CreateBranchBody,
  CreateTagBody,
  FetchBody,
  PushBody,
  StagePathsBody,
  StashPushBody,
  StashRefBody,
} from '../../shared/types';

export function useRepo(path: string) {
  return useQuery({ queryKey: ['repo', path], queryFn: () => api.repo(path), retry: false });
}

export function useLog(path: string, limit: number) {
  return useQuery({
    queryKey: ['log', path, 'list', limit],
    queryFn: () => api.log(path, limit),
    placeholderData: (prev) => prev,
  });
}

export function useLogStats(path: string, limit: number) {
  return useQuery({
    queryKey: ['log', path, 'stats', limit],
    queryFn: () => api.logStats(path, limit),
    placeholderData: (prev) => prev,
  });
}

export function useRefs(path: string) {
  return useQuery({ queryKey: ['refs', path], queryFn: () => api.refs(path) });
}

export function useStatus(path: string) {
  return useQuery({ queryKey: ['status', path], queryFn: () => api.status(path) });
}

export function useWorktrees(path: string) {
  return useQuery({ queryKey: ['worktrees', path], queryFn: () => api.worktrees(path) });
}

export function useStashes(path: string) {
  return useQuery({ queryKey: ['stashes', path], queryFn: () => api.stashes(path) });
}

export function useCommitDiff(path: string, sha: string | null, ignoreWhitespace = false) {
  return useQuery({
    queryKey: ['diff', path, 'commit', sha, ignoreWhitespace],
    queryFn: () => api.commitDiff(path, sha!, ignoreWhitespace),
    enabled: sha !== null,
  });
}

export function useWorkingDiff(path: string, enabled: boolean, worktree?: string, ignoreWhitespace = false) {
  return useQuery({
    queryKey: ['diff', path, 'working', worktree ?? null, ignoreWhitespace],
    queryFn: () => api.workingDiff(path, worktree, ignoreWhitespace),
    enabled,
  });
}

export interface MutationCallbacks {
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

/** Mirrors each git route's own bus.emit(scope) call (see server/routes/*.ts) so a
    mutation only refetches the query groups its git command could actually change. */
export function invalidateScope(qc: QueryClient, path: string, scope: ChangeScope, invalidateStashes = false) {
  if (scope === 'refs' || scope === 'all') {
    qc.invalidateQueries({ queryKey: ['log', path] });
    qc.invalidateQueries({ queryKey: ['refs', path] });
    qc.invalidateQueries({ queryKey: ['repo', path] });
  }
  if (scope === 'index' || scope === 'worktree' || scope === 'all') {
    qc.invalidateQueries({ queryKey: ['status', path] });
    qc.invalidateQueries({ queryKey: ['worktrees', path] });
    qc.invalidateQueries({ queryKey: ['diff', path, 'working'] });
  }
  if (invalidateStashes) qc.invalidateQueries({ queryKey: ['stashes', path] });
}

function useGitMutation<TArgs>(
  fn: (args: TArgs) => Promise<unknown>,
  successMsg: (args: TArgs) => string,
  cb: MutationCallbacks,
  path: string,
  scope: ChangeScope,
  invalidateStashes = false,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, args) => cb.onSuccess?.(successMsg(args)),
    onError: (err) => cb.onError?.(err instanceof Error ? err.message : String(err)),
    onSettled: () => invalidateScope(qc, path, scope, invalidateStashes),
  });
}

export function useGitActions(path: string, cb: MutationCallbacks) {
  const checkout = useGitMutation(
    (b: CheckoutBody) => api.checkout(path, b),
    (a) => `Checked out ${a.ref}`,
    cb,
    path,
    'refs',
  );
  const createBranch = useGitMutation(
    (b: CreateBranchBody) => api.createBranch(path, b),
    (a) => `Created branch ${a.name}${a.checkout ? ' · checked out' : ''}`,
    cb,
    path,
    'refs',
  );
  const createTag = useGitMutation(
    (b: CreateTagBody) => api.createTag(path, b),
    (a) => `Created tag ${a.name}`,
    cb,
    path,
    'refs',
  );
  const stage = useGitMutation(
    (b: StagePathsBody) => api.stage(path, b),
    (a) => (a.paths.length > 1 ? `Staged ${a.paths.length} files` : `Staged ${a.paths[0]}`),
    cb,
    path,
    'index',
  );
  const unstage = useGitMutation(
    (b: StagePathsBody) => api.unstage(path, b),
    (a) => (a.paths.length > 1 ? `Unstaged ${a.paths.length} files` : `Unstaged ${a.paths[0]}`),
    cb,
    path,
    'index',
  );
  const commit = useGitMutation(
    (b: CommitBody) => api.commit(path, b),
    (a) => (a.amend ? 'Amended last commit' : 'Committed staged changes'),
    cb,
    path,
    'all',
  );
  const uncommit = useGitMutation(
    (_b: void) => api.uncommit(path),
    () => 'Uncommitted — changes kept staged',
    cb,
    path,
    'all',
  );
  const fetchRemote = useGitMutation(
    (b: FetchBody) => api.fetchRemote(path, b),
    (a) => `Fetched ${a.remote ?? 'all remotes'}`,
    cb,
    path,
    'refs',
  );
  const push = useGitMutation(
    (b: PushBody) => api.push(path, b),
    (a) => `Pushed ${a.ref ?? 'current branch'}`,
    cb,
    path,
    'refs',
  );
  const pull = useGitMutation((_b: void) => api.pull(path), () => 'Pulled', cb, path, 'all');
  const stashPush = useGitMutation(
    (b: StashPushBody) => api.stashPush(path, b),
    () => 'Stashed changes',
    cb,
    path,
    'all',
    true,
  );
  const stashApply = useGitMutation(
    (b: StashRefBody) => api.stashApply(path, b),
    () => 'Applied stash',
    cb,
    path,
    'all',
    true,
  );
  const stashPop = useGitMutation(
    (b: StashRefBody) => api.stashPop(path, b),
    () => 'Popped stash',
    cb,
    path,
    'all',
    true,
  );
  const stashDrop = useGitMutation(
    (b: StashRefBody) => api.stashDrop(path, b),
    () => 'Dropped stash',
    cb,
    path,
    'refs',
    true,
  );
  return {
    checkout,
    createBranch,
    createTag,
    stage,
    unstage,
    commit,
    uncommit,
    fetchRemote,
    push,
    pull,
    stashPush,
    stashApply,
    stashPop,
    stashDrop,
  };
}
