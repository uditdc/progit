import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppContext } from '../app.js';
import type { RepoHandle } from '../repos.js';
import { validateRefName } from '../git.js';
import type { CredentialAnswerBody, FetchBody, PushBody } from '../../shared/types.js';

const ASKPASS_TIMEOUT_MS = 120_000;

/** askpass.cjs sits next to this module both in src (dev) and in dist (bundled). */
function helperPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, 'askpass.cjs'), join(here, '..', 'askpass.cjs')]) {
    if (existsSync(p)) return p;
  }
  throw new Error('askpass.cjs helper not found');
}

export function remoteRoutes(ctx: AppContext) {
  const r = new Hono();
  const pending = new Map<string, (value: string) => void>();

  const askpass = helperPath();
  try {
    chmodSync(askpass, 0o755);
  } catch {
    /* read-only install — git will fail loudly if it cannot exec the helper */
  }

  const remoteEnv = (repo: RepoHandle): Record<string, string> => ({
    GIT_ASKPASS: askpass,
    SSH_ASKPASS: askpass,
    SSH_ASKPASS_REQUIRE: 'force',
    GIT_TERMINAL_PROMPT: '0',
    PROGIT_ASKPASS_URL: `http://127.0.0.1:${ctx.runtime.port}/api/askpass?token=${ctx.runtime.token}&path=${encodeURIComponent(repo.root)}`,
  });

  // long-poll target for the askpass helper — answered by POST /credentials
  r.get('/askpass', async (c) => {
    if (c.req.query('token') !== ctx.runtime.token) return c.text('', 403);
    const repo = await ctx.repo(c);
    const prompt = c.req.query('prompt') ?? '';
    const id = randomUUID();
    const answer = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve('');
      }, ASKPASS_TIMEOUT_MS);
      pending.set(id, (value) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(value);
      });
      repo.bus.publish({ type: 'credential', id, prompt });
    });
    return answer ? c.text(answer) : c.text('', 404);
  });

  r.post('/credentials', async (c) => {
    const body = await c.req.json<CredentialAnswerBody>();
    const resolve = pending.get(body.requestId);
    if (!resolve) return c.json({ error: 'Unknown or expired credential request' }, 404);
    resolve(body.value ?? '');
    return c.json({ ok: true });
  });

  r.post('/fetch', async (c) => {
    const repo = await ctx.repo(c);
    const body = await c.req.json<FetchBody>().catch(() => ({}) as FetchBody);
    const args = ['fetch', '--prune'];
    if (body.remote) {
      const remotes = (await repo.git.read(['remote'])).split('\n').filter(Boolean);
      if (!remotes.includes(body.remote)) return c.json({ error: `Unknown remote: ${body.remote}` }, 400);
      args.push(body.remote);
    } else {
      args.push('--all');
    }
    await repo.git.write(args, { env: remoteEnv(repo) });
    repo.bus.emit('refs');
    return c.json({ ok: true });
  });

  r.post('/push', async (c) => {
    const repo = await ctx.repo(c);
    const body = await c.req.json<PushBody>().catch(() => ({}) as PushBody);
    let ref = body.ref;
    if (ref && !validateRefName(ref)) return c.json({ error: 'Invalid ref' }, 400);
    if (!ref) {
      ref = (await repo.git.read(['symbolic-ref', '--short', '-q', 'HEAD'], { okCodes: [0, 1] })).trim();
      if (!ref) return c.json({ error: 'Detached HEAD — check out a branch to push' }, 400);
    }
    const remote = (await repo.git.read(['config', '--get', `branch.${ref}.remote`], { okCodes: [0, 1] })).trim();
    const args = remote ? ['push', remote, ref] : ['push', '--set-upstream', 'origin', ref];
    await repo.git.write(args, { env: remoteEnv(repo) });
    repo.bus.emit('refs');
    return c.json({ ok: true, setUpstream: !remote });
  });

  r.post('/pull', async (c) => {
    const repo = await ctx.repo(c);
    const branch = (await repo.git.read(['symbolic-ref', '--short', '-q', 'HEAD'], { okCodes: [0, 1] })).trim();
    if (!branch) return c.json({ error: 'Detached HEAD — check out a branch to pull' }, 400);
    // fast-forward only: a GUI pull must be deterministic — divergence needs an
    // explicit merge/rebase decision, which gets its own UI flow
    await repo.git.write(['pull', '--ff-only'], { env: remoteEnv(repo) });
    repo.bus.emit('all');
    return c.json({ ok: true });
  });

  return r;
}
