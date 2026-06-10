import { basename } from 'node:path';
import type { Worktree } from '../../shared/types.js';

/** Parses `git worktree list --porcelain` output. */
export function parseWorktrees(out: string): Worktree[] {
  const result: Worktree[] = [];
  for (const block of out.split('\n\n')) {
    if (!block.trim()) continue;
    let path = '';
    let head = '';
    let branch: string | null = null;
    let bare = false;
    let locked = false;
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      else if (line === 'bare') bare = true;
      else if (line.startsWith('locked')) locked = true;
    }
    if (!path) continue;
    result.push({
      name: basename(path),
      path,
      branch,
      head,
      current: false,
      dirty: 0,
      ...(bare ? { bare: true } : {}),
      ...(locked ? { locked: true } : {}),
    });
  }
  return result;
}
