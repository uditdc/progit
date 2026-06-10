import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import { validatePath, validateRefName, validateRevision } from '../git.js';
import type {
  CheckoutBody,
  CommitBody,
  CreateBranchBody,
  CreateTagBody,
  StagePathsBody,
} from '../../shared/types.js';
import { resolveWorktreeCwd } from './status.js';

export function actionRoutes(ctx: AppContext) {
  const r = new Hono();

  r.post('/checkout', async (c) => {
    const { git, bus } = await ctx.repo(c);
    const body = await c.req.json<CheckoutBody>();
    if (!validateRevision(body.ref)) return c.json({ error: 'Invalid ref' }, 400);
    await git.write(['checkout', body.ref]);
    bus.emit('refs');
    return c.json({ ok: true });
  });

  r.post('/branches', async (c) => {
    const { git, bus } = await ctx.repo(c);
    const body = await c.req.json<CreateBranchBody>();
    if (!validateRefName(body.name)) return c.json({ error: 'Invalid branch name' }, 400);
    if (!validateRevision(body.startPoint)) return c.json({ error: 'Invalid start point' }, 400);
    await git.write(['branch', '--', body.name, body.startPoint]);
    if (body.checkout) await git.write(['checkout', body.name]);
    bus.emit('refs');
    return c.json({ ok: true });
  });

  r.post('/tags', async (c) => {
    const { git, bus } = await ctx.repo(c);
    const body = await c.req.json<CreateTagBody>();
    if (!validateRefName(body.name)) return c.json({ error: 'Invalid tag name' }, 400);
    if (!validateRevision(body.target)) return c.json({ error: 'Invalid target' }, 400);
    await git.write(['tag', '--', body.name, body.target]);
    bus.emit('refs');
    return c.json({ ok: true });
  });

  r.post('/stage', async (c) => {
    const repo = await ctx.repo(c);
    const body = await c.req.json<StagePathsBody>();
    if (!body.paths.length || !body.paths.every(validatePath)) return c.json({ error: 'Invalid paths' }, 400);
    const cwd = await resolveWorktreeCwd(repo, body.worktree);
    await repo.git.write(['add', '--', ...body.paths], { cwd });
    repo.bus.emit('index');
    return c.json({ ok: true });
  });

  r.post('/unstage', async (c) => {
    const repo = await ctx.repo(c);
    const body = await c.req.json<StagePathsBody>();
    if (!body.paths.length || !body.paths.every(validatePath)) return c.json({ error: 'Invalid paths' }, 400);
    const cwd = await resolveWorktreeCwd(repo, body.worktree);
    await repo.git.write(['restore', '--staged', '--', ...body.paths], { cwd });
    repo.bus.emit('index');
    return c.json({ ok: true });
  });

  r.post('/commit', async (c) => {
    const { git, bus } = await ctx.repo(c);
    const body = await c.req.json<CommitBody>();
    if (!body.message || !body.message.trim()) return c.json({ error: 'Commit message is required' }, 400);
    await git.write(['commit', '--file=-'], { stdin: body.message });
    bus.emit('all');
    return c.json({ ok: true });
  });

  // soft-reset the tip commit — its changes return to the staging area
  r.post('/uncommit', async (c) => {
    const { git, bus } = await ctx.repo(c);
    const head = (await git.read(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] })).trim();
    if (!head) return c.json({ error: 'Nothing to uncommit' }, 400);
    const hasParent = (await git.read(['rev-parse', '-q', '--verify', 'HEAD^'], { okCodes: [0, 1] })).trim() !== '';
    if (hasParent) {
      await git.write(['reset', '--soft', 'HEAD^']);
    } else {
      // root commit — deleting HEAD's ref uncommits it, leaving the files staged
      await git.write(['update-ref', '-d', 'HEAD']);
    }
    bus.emit('all');
    return c.json({ ok: true });
  });

  return r;
}
