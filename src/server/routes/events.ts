import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppContext } from '../app.js';
import type { BusEvent } from '../../shared/types.js';

const HEARTBEAT_MS = 25_000;

export function eventRoutes(ctx: AppContext) {
  const r = new Hono();

  r.get('/events', async (c) => {
    const { bus } = await ctx.repo(c);
    return streamSSE(c, async (stream) => {
      let open = true;
      let wake: (() => void) | null = null;
      const queue: BusEvent[] = [];

      const unsubscribe = bus.subscribe((e) => {
        queue.push(e);
        wake?.();
      });
      stream.onAbort(() => {
        open = false;
        unsubscribe();
        wake?.();
      });

      while (open) {
        while (queue.length) {
          const e = queue.shift()!;
          await stream.writeSSE({ event: e.type, data: JSON.stringify(e) });
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, HEARTBEAT_MS);
        });
        wake = null;
        if (open && queue.length === 0) {
          await stream.writeSSE({ event: 'ping', data: '' });
        }
      }
    });
  });

  return r;
}
