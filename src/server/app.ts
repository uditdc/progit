import { Hono } from 'hono';
import type { Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitError } from './git.js';
import { RepoOpenError, type RepoHandle, type RepoRegistry } from './repos.js';
import type { RepoInfo } from '../shared/types.js';
import { logRoutes } from './routes/log.js';
import { statusRoutes } from './routes/status.js';
import { diffRoutes } from './routes/diff.js';
import { actionRoutes } from './routes/actions.js';
import { eventRoutes } from './routes/events.js';
import { remoteRoutes } from './routes/remote.js';
import { stashRoutes } from './routes/stash.js';

export interface AppRuntime {
  /** Listening port — set by the CLI once the server is bound; used by the askpass bridge. */
  port: number;
  /** Per-process secret the askpass helper must echo back. */
  token: string;
}

export interface AppContext {
  registry: RepoRegistry;
  runtime: AppRuntime;
  /** Resolves the request's ?path= to a repo handle (400 when missing/invalid). */
  repo(c: Context): Promise<RepoHandle>;
}

export function createApp(registry: RepoRegistry, runtime: AppRuntime) {
  const app = new Hono();
  const api = new Hono();

  const ctx: AppContext = {
    registry,
    runtime,
    repo(c) {
      const path = c.req.query('path');
      if (!path) throw new RepoOpenError('missing ?path= query parameter');
      return registry.open(path);
    },
  };

  // identity probe — lets a second CLI invocation detect a running progit and reuse it
  api.get('/ping', (c) => c.json({ progit: true }));

  api.get('/repo', async (c) => {
    const { git, root } = await ctx.repo(c);
    const [branchOut, headOut, versionOut] = await Promise.all([
      git.read(['symbolic-ref', '--short', '-q', 'HEAD'], { okCodes: [0, 1] }),
      git.read(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] }),
      git.read(['--version']),
    ]);
    const info: RepoInfo = {
      name: basename(root),
      path: root,
      branch: branchOut.trim() || null,
      head: headOut.trim() || null,
      gitVersion: versionOut.trim().replace(/^git version /, ''),
    };
    return c.json(info);
  });

  api.route('/', logRoutes(ctx));
  api.route('/', statusRoutes(ctx));
  api.route('/', diffRoutes(ctx));
  api.route('/', actionRoutes(ctx));
  api.route('/', eventRoutes(ctx));
  api.route('/', remoteRoutes(ctx));
  api.route('/', stashRoutes(ctx));

  api.onError((err, c) => {
    if (err instanceof RepoOpenError) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof GitError) {
      return c.json({ error: err.stderr.trim() || err.message, code: err.exitCode }, 409);
    }
    console.error(err);
    return c.json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  });

  app.route('/api', api);

  // static client (production build)
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDir = join(here, '..', 'client');
  const rootRel = relative(process.cwd(), clientDir);
  app.use('/*', serveStatic({ root: rootRel }));
  app.get('*', serveStatic({ path: join(rootRel, 'index.html') }));

  return app;
}
