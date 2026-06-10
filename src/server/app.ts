import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GitRunner } from './git.js';
import { GitError } from './git.js';
import type { RepoInfo } from '../shared/types.js';
import { logRoutes } from './routes/log.js';
import { statusRoutes } from './routes/status.js';
import { diffRoutes } from './routes/diff.js';
import { actionRoutes } from './routes/actions.js';
import { eventRoutes } from './routes/events.js';
import type { ChangeBus } from './watcher.js';

export interface AppContext {
  git: GitRunner;
  bus: ChangeBus;
}

export function createApp(ctx: AppContext) {
  const app = new Hono();
  const api = new Hono();

  api.get('/repo', async (c) => {
    const { git } = ctx;
    const [branchOut, headOut, versionOut] = await Promise.all([
      git.read(['symbolic-ref', '--short', '-q', 'HEAD'], { okCodes: [0, 1] }),
      git.read(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] }),
      git.read(['--version']),
    ]);
    const info: RepoInfo = {
      name: basename(git.root),
      path: git.root,
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

  api.onError((err, c) => {
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
