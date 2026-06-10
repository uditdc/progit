import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import { LOG_FORMAT, parseLog, parseLogStats } from '../parse/log.js';
import { parseRefs, REFS_FORMAT } from '../parse/refs.js';
import type { LogPayload, RefsPayload } from '../../shared/types.js';

function clampLimit(raw: string | undefined): number {
  return Math.min(Math.max(Number(raw) || 500, 1), 10000);
}

const LOG_SCOPE = ['--branches', '--remotes', '--tags', 'HEAD'];

export function logRoutes(ctx: AppContext) {
  const r = new Hono();

  const hasHead = async () =>
    (await ctx.git.read(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] })).trim() !== '';

  r.get('/log', async (c) => {
    const limit = clampLimit(c.req.query('limit'));
    if (!(await hasHead())) {
      return c.json({ commits: [], hasMore: false } satisfies LogPayload);
    }
    const out = await ctx.git.read([
      'log',
      '--topo-order',
      `--max-count=${limit + 1}`,
      `--pretty=format:${LOG_FORMAT}`,
      ...LOG_SCOPE,
    ]);
    const commits = parseLog(out);
    const hasMore = commits.length > limit;
    return c.json({ commits: commits.slice(0, limit), hasMore } satisfies LogPayload);
  });

  // per-commit +/- totals, fetched separately — numstat costs ~10-20x the log itself
  r.get('/log/stats', async (c) => {
    const limit = clampLimit(c.req.query('limit'));
    if (!(await hasHead())) return c.json({});
    const out = await ctx.git.read([
      'log',
      '--topo-order',
      `--max-count=${limit}`,
      '--pretty=format:%H%x1e',
      '--numstat',
      ...LOG_SCOPE,
    ]);
    return c.json(parseLogStats(out));
  });

  r.get('/refs', async (c) => {
    const out = await ctx.git.read([
      'for-each-ref',
      `--format=${REFS_FORMAT}`,
      '--sort=-committerdate',
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ]);
    const payload: RefsPayload = parseRefs(out);
    if (!payload.local.some((b) => b.current)) {
      const head = (await ctx.git.read(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] })).trim();
      if (head) payload.detachedHead = head;
    }
    return c.json(payload);
  });

  return r;
}
