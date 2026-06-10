import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  CheckoutBody,
  CommitBody,
  CreateBranchBody,
  CreateTagBody,
  FetchBody,
  PushBody,
  StagePathsBody,
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

export function useCommitDiff(path: string, sha: string | null) {
  return useQuery({
    queryKey: ['diff', path, 'commit', sha],
    queryFn: () => api.commitDiff(path, sha!),
    enabled: sha !== null,
  });
}

export function useWorkingDiff(path: string, enabled: boolean, worktree?: string) {
  return useQuery({
    queryKey: ['diff', path, 'working', worktree ?? null],
    queryFn: () => api.workingDiff(path, worktree),
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

export function useGitActions(path: string, cb: MutationCallbacks) {
  const checkout = useGitMutation((b: CheckoutBody) => api.checkout(path, b), (a) => `Checked out ${a.ref}`, cb);
  const createBranch = useGitMutation(
    (b: CreateBranchBody) => api.createBranch(path, b),
    (a) => `Created branch ${a.name}${a.checkout ? ' · checked out' : ''}`,
    cb,
  );
  const createTag = useGitMutation((b: CreateTagBody) => api.createTag(path, b), (a) => `Created tag ${a.name}`, cb);
  const stage = useGitMutation(
    (b: StagePathsBody) => api.stage(path, b),
    (a) => (a.paths.length > 1 ? `Staged ${a.paths.length} files` : `Staged ${a.paths[0]}`),
    cb,
  );
  const unstage = useGitMutation(
    (b: StagePathsBody) => api.unstage(path, b),
    (a) => (a.paths.length > 1 ? `Unstaged ${a.paths.length} files` : `Unstaged ${a.paths[0]}`),
    cb,
  );
  const commit = useGitMutation(
    (b: CommitBody) => api.commit(path, b),
    (a) => (a.amend ? 'Amended last commit' : 'Committed staged changes'),
    cb,
  );
  const uncommit = useGitMutation((_b: void) => api.uncommit(path), () => 'Uncommitted — changes kept staged', cb);
  const fetchRemote = useGitMutation(
    (b: FetchBody) => api.fetchRemote(path, b),
    (a) => `Fetched ${a.remote ?? 'all remotes'}`,
    cb,
  );
  const push = useGitMutation((b: PushBody) => api.push(path, b), (a) => `Pushed ${a.ref ?? 'current branch'}`, cb);
  const pull = useGitMutation((_b: void) => api.pull(path), () => 'Pulled', cb);
  return { checkout, createBranch, createTag, stage, unstage, commit, uncommit, fetchRemote, push, pull };
}
