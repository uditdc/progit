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
    const body = await c.req.json<CheckoutBody>();
    if (!validateRevision(body.ref)) return c.json({ error: 'Invalid ref' }, 400);
    await ctx.git.write(['checkout', body.ref]);
    ctx.bus.emit('refs');
    return c.json({ ok: true });
  });

  r.post('/branches', async (c) => {
    const body = await c.req.json<CreateBranchBody>();
    if (!validateRefName(body.name)) return c.json({ error: 'Invalid branch name' }, 400);
    if (!validateRevision(body.startPoint)) return c.json({ error: 'Invalid start point' }, 400);
    await ctx.git.write(['branch', '--', body.name, body.startPoint]);
    if (body.checkout) await ctx.git.write(['checkout', body.name]);
    ctx.bus.emit('refs');
    return c.json({ ok: true });
  });

  r.post('/tags', async (c) => {
    const body = await c.req.json<CreateTagBody>();
    if (!validateRefName(body.name)) return c.json({ error: 'Invalid tag name' }, 400);
    if (!validateRevision(body.target)) return c.json({ error: 'Invalid target' }, 400);
    await ctx.git.write(['tag', '--', body.name, body.target]);
    ctx.bus.emit('refs');
    return c.json({ ok: true });
  });

  r.post('/stage', async (c) => {
    const body = await c.req.json<StagePathsBody>();
    if (!body.paths.length || !body.paths.every(validatePath)) return c.json({ error: 'Invalid paths' }, 400);
    const cwd = await resolveWorktreeCwd(ctx, body.worktree);
    await ctx.git.write(['add', '--', ...body.paths], { cwd });
    ctx.bus.emit('index');
    return c.json({ ok: true });
  });

  r.post('/unstage', async (c) => {
    const body = await c.req.json<StagePathsBody>();
    if (!body.paths.length || !body.paths.every(validatePath)) return c.json({ error: 'Invalid paths' }, 400);
    const cwd = await resolveWorktreeCwd(ctx, body.worktree);
    await ctx.git.write(['restore', '--staged', '--', ...body.paths], { cwd });
    ctx.bus.emit('index');
    return c.json({ ok: true });
  });

  r.post('/commit', async (c) => {
    const body = await c.req.json<CommitBody>();
    if (!body.message || !body.message.trim()) return c.json({ error: 'Commit message is required' }, 400);
    await ctx.git.write(['commit', '--file=-'], { stdin: body.message });
    ctx.bus.emit('all');
    return c.json({ ok: true });
  });

  return r;
}
