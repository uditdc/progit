import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppRuntime } from '../src/server/app.js';
import { createRegistry } from '../src/server/repos.js';
import type { CommitDiffPayload, WorkingDiffPayload } from '../src/shared/types.js';

function git(cwd: string, args: string[]) {
  execFileSync('git', args, { cwd });
}

describe('diff -w (ignore whitespace) query flag', () => {
  let root: string;
  let commit1: string;
  let commit2: string;
  const runtime: AppRuntime = { port: 0, token: 'test-secret-token' };
  const registry = createRegistry();
  const app = createApp(registry, runtime);

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'progit-diff-w-'));
    git(root, ['init', '-q']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    writeFileSync(join(root, 'file.txt'), 'hello\nworld\n');
    git(root, ['add', 'file.txt']);
    git(root, ['commit', '-q', '-m', 'initial']);
    commit1 = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();

    // whitespace-only change, committed
    writeFileSync(join(root, 'file.txt'), 'hello\nworld   \n');
    git(root, ['commit', '-q', '-am', 'trailing whitespace only']);
    commit2 = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();

    // another whitespace-only change, left unstaged for the working-diff endpoint
    writeFileSync(join(root, 'file.txt'), 'hello\n   world\n');
  });

  afterAll(async () => {
    await registry.closeAll();
    rmSync(root, { recursive: true, force: true });
  });

  it('GET /diff/working reports the unstaged whitespace change by default', async () => {
    const res = await app.request(`/api/diff/working?path=${encodeURIComponent(root)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorkingDiffPayload;
    expect(body.unstaged).toHaveLength(1);
  });

  it('GET /diff/working?w=1 matches `git diff -w` and hides the whitespace-only change', async () => {
    const res = await app.request(`/api/diff/working?path=${encodeURIComponent(root)}&w=1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorkingDiffPayload;
    expect(body.unstaged).toHaveLength(0);

    const rawOut = execFileSync('git', ['diff', '-w'], { cwd: root }).toString();
    expect(rawOut.trim()).toBe('');
  });

  it('GET /diff/commit/:sha reports the whitespace-only commit by default', async () => {
    const res = await app.request(`/api/diff/commit/${commit2}?path=${encodeURIComponent(root)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CommitDiffPayload;
    expect(body.files).toHaveLength(1);
  });

  it('GET /diff/commit/:sha?w=1 matches `git diff -w` and hides the whitespace-only commit', async () => {
    const res = await app.request(`/api/diff/commit/${commit2}?path=${encodeURIComponent(root)}&w=1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CommitDiffPayload;
    expect(body.files).toHaveLength(0);

    const rawOut = execFileSync('git', ['diff', '-w', `${commit1}..${commit2}`], { cwd: root }).toString();
    expect(rawOut.trim()).toBe('');
  });
});
