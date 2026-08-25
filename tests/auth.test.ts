import { describe, expect, it } from 'vitest';
import { createApp, type AppRuntime } from '../src/server/app.js';
import type { RepoRegistry } from '../src/server/repos.js';

const stubRegistry: RepoRegistry = {
  open: () => Promise.reject(new Error('not reached — auth gate should short-circuit first')),
  closeAll: () => Promise.resolve(),
};

function makeApp() {
  const runtime: AppRuntime = { port: 0, token: 'test-secret-token' };
  return { app: createApp(stubRegistry, runtime), runtime };
}

describe('mutating-request auth gate', () => {
  it('rejects an unauthenticated POST to a mutating route with 401', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/commit?path=/tmp/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a POST with the wrong token with 401', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/commit?path=/tmp/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-progit-token': 'wrong' },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(res.status).toBe(401);
  });

  it('lets a POST through with the correct token (past the auth gate, not 401)', async () => {
    const { app, runtime } = makeApp();
    const res = await app.request('/api/commit?path=/tmp/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-progit-token': runtime.token },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(res.status).not.toBe(401);
  });

  it('leaves GET/read-only routes unauthenticated', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/ping');
    expect(res.status).toBe(200);
  });

  it('exposes the shared token via GET /api/session without auth', async () => {
    const { app, runtime } = makeApp();
    const res = await app.request('/api/session');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(runtime.token);
  });
});
