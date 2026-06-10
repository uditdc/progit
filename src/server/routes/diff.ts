import { Hono } from 'hono';
import { join } from 'node:path';
import type { AppContext } from '../app.js';
import { validateRevision } from '../git.js';
import { parseUnifiedDiff } from '../parse/unified-diff.js';
import { parseStatus } from '../parse/status.js';
import { resolveWorktreeCwd } from './status.js';
import type { CommitDiffPayload, FileDiff, WorkingDiffPayload } from '../../shared/types.js';

const DIFF_ARGS = ['--no-color', '--find-renames'];

export function diffRoutes(ctx: AppContext) {
  const r = new Hono();

  r.get('/diff/commit/:sha', async (c) => {
    const { git } = await ctx.repo(c);
    const sha = c.req.param('sha');
    if (!validateRevision(sha)) return c.json({ error: 'Invalid revision' }, 400);
    const parents = (await git.read(['rev-list', '--parents', '-n', '1', sha])).trim().split(' ');
    let out: string;
    if (parents.length > 2) {
      // merge commit — show the first-parent diff
      out = await git.read(['diff', ...DIFF_ARGS, `${sha}^1`, sha]);
    } else {
      out = await git.read(['diff-tree', '-p', '--root', ...DIFF_ARGS, sha]);
    }
    return c.json({ sha, files: parseUnifiedDiff(out) } satisfies CommitDiffPayload);
  });

  r.get('/diff/working', async (c) => {
    const repo = await ctx.repo(c);
    const cwd = await resolveWorktreeCwd(repo, c.req.query('worktree'));
    const [unstagedOut, stagedOut, statusOut] = await Promise.all([
      repo.git.read(['diff', ...DIFF_ARGS], { cwd, okCodes: [0, 1] }),
      repo.git.read(['diff', '--cached', ...DIFF_ARGS], { cwd, okCodes: [0, 1] }),
      repo.git.read(['status', '--porcelain=v2', '-z', '--untracked-files=all'], { cwd }),
    ]);
    const status = parseStatus(statusOut);
    const untracked: FileDiff[] = (
      await Promise.all(
        status.untracked.map(async (f) => {
          const out = await repo.git.read(
            ['diff', '--no-color', '--no-index', '--', '/dev/null', join(cwd, f.path)],
            { cwd, okCodes: [0, 1] },
          );
          const parsed = parseUnifiedDiff(out, 'untracked');
          const fd = parsed[0];
          if (!fd) return null;
          fd.path = f.path;
          return fd;
        }),
      )
    ).filter((f): f is FileDiff => f !== null);
    return c.json({
      staged: parseUnifiedDiff(stagedOut),
      unstaged: parseUnifiedDiff(unstagedOut),
      untracked,
    } satisfies WorkingDiffPayload);
  });

  return r;
}
