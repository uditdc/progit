import { describe, expect, it, vi } from 'vitest';
import { invalidateScope } from '../src/client/api/queries.js';

function mockQueryClient() {
  return { invalidateQueries: vi.fn() };
}

function invalidatedKeys(qc: ReturnType<typeof mockQueryClient>): string[] {
  return qc.invalidateQueries.mock.calls.map(([{ queryKey }]) => (queryKey as unknown[])[0] as string);
}

describe('invalidateScope', () => {
  it('index scope only touches status/worktrees/diff (e.g. stage/unstage)', () => {
    const qc = mockQueryClient();
    invalidateScope(qc as never, '/repo', 'index');
    expect(invalidatedKeys(qc).sort()).toEqual(['diff', 'status', 'worktrees']);
  });

  it('refs scope only touches log/refs/repo (e.g. checkout/branch/tag/fetch/push)', () => {
    const qc = mockQueryClient();
    invalidateScope(qc as never, '/repo', 'refs');
    expect(invalidatedKeys(qc).sort()).toEqual(['log', 'refs', 'repo']);
  });

  it('all scope touches every group (e.g. commit/uncommit/pull)', () => {
    const qc = mockQueryClient();
    invalidateScope(qc as never, '/repo', 'all');
    expect(invalidatedKeys(qc).sort()).toEqual(['diff', 'log', 'refs', 'repo', 'status', 'worktrees']);
  });

  it('never touches stashes unless explicitly requested', () => {
    const qc = mockQueryClient();
    invalidateScope(qc as never, '/repo', 'all');
    expect(invalidatedKeys(qc)).not.toContain('stashes');
  });

  it('invalidates stashes when a stash mutation asks for it, alongside its scope', () => {
    const qc = mockQueryClient();
    invalidateScope(qc as never, '/repo', 'refs', true);
    expect(invalidatedKeys(qc).sort()).toEqual(['log', 'refs', 'repo', 'stashes']);
  });

  it('scopes all invalidated keys to the given repo path', () => {
    const qc = mockQueryClient();
    invalidateScope(qc as never, '/some/repo', 'all', true);
    for (const [{ queryKey }] of qc.invalidateQueries.mock.calls) {
      expect((queryKey as unknown[])[1]).toBe('/some/repo');
    }
  });
});
