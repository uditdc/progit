import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import { parseStatus } from '../parse/status.js';
import { parseWorktrees } from '../parse/worktree.js';
import type { Worktree } from '../../shared/types.js';

/** Resolves a ?worktree= param to a registered worktree path, or the main root. */
export async function resolveWorktreeCwd(ctx: AppContext, param: string | undefined): Promise<string> {
  if (!param) return ctx.git.root;
  const out = await ctx.git.read(['worktree', 'list', '--porcelain']);
  const wt = parseWorktrees(out).find((w) => w.path === param);
  if (!wt) throw new Error(`Unknown worktree: ${param}`);
  return wt.path;
}

export function statusRoutes(ctx: AppContext) {
  const r = new Hono();

  r.get('/status', async (c) => {
    const cwd = await resolveWorktreeCwd(ctx, c.req.query('worktree'));
    const out = await ctx.git.read(['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'], { cwd });
    return c.json(parseStatus(out));
  });

  r.get('/worktrees', async (c) => {
    const out = await ctx.git.read(['worktree', 'list', '--porcelain']);
    const worktrees = parseWorktrees(out).filter((w) => !w.bare);
    await Promise.all(
      worktrees.map(async (w) => {
        w.current = w.path === ctx.git.root;
        try {
          const st = await ctx.git.read(['status', '--porcelain=v2', '-z', '--untracked-files=all'], { cwd: w.path });
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
