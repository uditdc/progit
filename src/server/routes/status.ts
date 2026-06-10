import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import type { RepoHandle } from '../repos.js';
import { parseStatus } from '../parse/status.js';
import { parseWorktrees } from '../parse/worktree.js';
import type { Worktree } from '../../shared/types.js';

/** Resolves a ?worktree= param to a registered worktree path, or the main root. */
export async function resolveWorktreeCwd(repo: RepoHandle, param: string | undefined): Promise<string> {
  if (!param) return repo.root;
  const out = await repo.git.read(['worktree', 'list', '--porcelain']);
  const wt = parseWorktrees(out).find((w) => w.path === param);
  if (!wt) throw new Error(`Unknown worktree: ${param}`);
  return wt.path;
}

export function statusRoutes(ctx: AppContext) {
  const r = new Hono();

  r.get('/status', async (c) => {
    const repo = await ctx.repo(c);
    const cwd = await resolveWorktreeCwd(repo, c.req.query('worktree'));
    const out = await repo.git.read(['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'], { cwd });
    return c.json(parseStatus(out));
  });

  r.get('/worktrees', async (c) => {
    const repo = await ctx.repo(c);
    const out = await repo.git.read(['worktree', 'list', '--porcelain']);
    const worktrees = parseWorktrees(out).filter((w) => !w.bare);
    await Promise.all(
      worktrees.map(async (w) => {
        w.current = w.path === repo.root;
        try {
          const st = await repo.git.read(['status', '--porcelain=v2', '-z', '--untracked-files=all'], { cwd: w.path });
          const s = parseStatus(st);
          w.dirty = s.staged.length + s.unstaged.length + s.untracked.length + s.conflicted.length;
        } catch {
          w.dirty = 0;
        }
      }),
    );
    return c.json(worktrees satisfies Worktree[]);
  });

  return r;
}
