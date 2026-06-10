import { describe, expect, it } from 'vitest';
import { computeAncestry, computeLanes } from '../src/client/graph/lanes.js';
import type { Commit, GitRef, RefsPayload } from '../src/shared/types.js';

const C = (id: string, parents: string[], msg = id): Commit => ({
  id,
  shortHash: id.slice(0, 8).padEnd(8, '0'),
  parents,
  author: 'A',
  email: 'a@x',
  date: '2026-01-01T00:00:00Z',
  msg,
  merge: parents.length > 1 || undefined,
});

const local = (name: string, tip: string, current = false): GitRef => ({ name, type: 'local', tip, current });

const refs = (locals: GitRef[], tags: GitRef[] = []): RefsPayload => ({ local: locals, remote: [], tags });

describe('computeLanes', () => {
  it('puts the checked-out branch first-parent chain on col 0', () => {
    // main: m3 <- m2 <- m1 ; feature forks at m2: f1
    const commits = [C('f1', ['m2']), C('m1', ['m2']), C('m2', ['m3']), C('m3', [])];
    const laned = computeLanes(commits, refs([local('main', 'm1', true), local('feat', 'f1')]), 'main');
    const byId = Object.fromEntries(laned.map((c) => [c.id, c]));
    expect(byId['m1']!.col).toBe(0);
    expect(byId['m2']!.col).toBe(0);
    expect(byId['m3']!.col).toBe(0);
    expect(byId['f1']!.col).toBe(1);
  });

  it('re-lanes when the other branch is checked out', () => {
    const commits = [C('f1', ['m2']), C('m1', ['m2']), C('m2', ['m3']), C('m3', [])];
    const laned = computeLanes(commits, refs([local('main', 'm1'), local('feat', 'f1', true)]), 'feat');
    const byId = Object.fromEntries(laned.map((c) => [c.id, c]));
    expect(byId['f1']!.col).toBe(0);
    expect(byId['m2']!.col).toBe(0); // shared history follows the spine
    expect(byId['m1']!.col).toBe(1); // main's unique commit moves off-spine
  });

  it('handles octopus merges (3 parents) without crashing and walks all parents', () => {
    const commits = [
      C('o1', ['m1', 'a1', 'b1']),
      C('a1', ['m1']),
      C('b1', ['m1']),
      C('m1', []),
    ];
    const laned = computeLanes(commits, refs([local('main', 'o1', true)]), 'main');
    const byId = Object.fromEntries(laned.map((c) => [c.id, c]));
    expect(byId['o1']!.col).toBe(0);
    expect(byId['m1']!.col).toBe(0);
    // a1/b1 unowned by any branch -> inherit a child lane (the merge, col 0 not allowed
    // since owner is set; they get swept to child's col)
    expect(byId['a1']!.col).toBeGreaterThanOrEqual(0);
    expect(byId['b1']!.col).toBeGreaterThanOrEqual(0);
  });

  it('terminates cleanly when parents fall outside the log window', () => {
    const commits = [C('m1', ['gone-sha']), C('f1', ['other-gone'])];
    const laned = computeLanes(commits, refs([local('main', 'm1', true), local('feat', 'f1')]), 'main');
    expect(laned).toHaveLength(2);
    expect(laned.find((c) => c.id === 'm1')!.col).toBe(0);
  });

  it('label-only branches (same tip as another ref) get no extra lane', () => {
    const commits = [C('m1', ['m2']), C('m2', [])];
    const laned = computeLanes(commits, refs([local('main', 'm1', true), local('alias', 'm1')]), 'main');
    const maxCol = Math.max(...laned.map((c) => c.col));
    expect(maxCol).toBe(0);
  });

  it('attaches refs to commits with head type for the current branch', () => {
    const commits = [C('m1', [])];
    const laned = computeLanes(
      commits,
      refs([local('main', 'm1', true)], [{ name: 'v1', type: 'tag', tip: 'm1' }]),
      'main',
    );
    const types = laned[0]!.refs.map((r) => r.type);
    expect(types).toContain('head');
    expect(types).toContain('tag');
  });

  it('supports detached HEAD as the spine', () => {
    const commits = [C('m1', ['m2']), C('m2', [])];
    const laned = computeLanes(commits, refs([local('main', 'm2')]), null, 'm1');
    expect(laned.find((c) => c.id === 'm1')!.col).toBe(0);
  });

  it('sweeps orphan commits to a lane instead of dropping them', () => {
    const commits = [C('m1', []), C('orphan', [])];
    const laned = computeLanes(commits, refs([local('main', 'm1', true)]), 'main');
    expect(laned.find((c) => c.id === 'orphan')!.col).toBeGreaterThan(0);
  });
});

describe('computeAncestry', () => {
  it('walks all parents inclusive of the tip', () => {
    const commits = [C('m1', ['m2', 'f1']), C('f1', ['m2']), C('m2', []), C('x', [])];
    const anc = computeAncestry(commits, 'm1');
    expect(anc).toEqual(new Set(['m1', 'f1', 'm2']));
  });
});
