import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppContext } from '../app.js';
import type { ChangeScope, StashEntry, StashPushBody, StashRefBody } from '../../shared/types.js';
import { validateStashRef } from '../git.js';
import { parseStashes, STASH_FORMAT } from '../parse/stash.js';

export function stashRoutes(ctx: AppContext) {
  const r = new Hono();

  r.get('/stashes', async (c) => {
    const { git } = await ctx.repo(c);
    const out = await git.read(['stash', 'list', `--format=${STASH_FORMAT}`]);
    return c.json(parseStashes(out) satisfies StashEntry[]);
  });

  r.post('/stash', async (c) => {
    const { git, bus } = await ctx.repo(c);
    const body = await c.req.json<StashPushBody>().catch(() => ({}) as StashPushBody);
    const args = ['stash', 'push'];
    if (body.includeUntracked !== false) args.push('--include-untracked');
    const message = body.message?.trim();
    if (message) args.push('-m', message);
    const out = await git.write(args);
    if (/^No local changes to save/m.test(out)) return c.json({ error: 'No local changes to stash' }, 400);
    bus.emit('all');
    return c.json({ ok: true });
  });

  // apply/pop/drop share the same stash@{N} contract; only the verb and the
  // affected scope differ (drop touches refs/stash only, apply/pop the worktree)
  const refAction = (verb: 'apply' | 'pop' | 'drop', scope: ChangeScope) => async (c: Context) => {
    const { git, bus } = await ctx.repo(c);
    const body = await c.req.json<StashRefBody>();
    if (!validateStashRef(body.ref)) return c.json({ error: 'Invalid stash ref' }, 400);
    await git.write(['stash', verb, body.ref]);
    bus.emit(scope);
    return c.json({ ok: true });
  };

  r.post('/stash/apply', refAction('apply', 'all'));
  r.post('/stash/pop', refAction('pop', 'all'));
  r.post('/stash/drop', refAction('drop', 'refs'));

  return r;
}
