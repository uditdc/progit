import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLog } from '../src/server/parse/log.js';
import { parseRefs } from '../src/server/parse/refs.js';
import { parseStatus } from '../src/server/parse/status.js';
import { parseWorktrees } from '../src/server/parse/worktree.js';
import { parseUnifiedDiff } from '../src/server/parse/unified-diff.js';
import { parseStashes } from '../src/server/parse/stash.js';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseLog', () => {
  const commits = parseLog(fixture('log.txt'));

  it('parses all commits with shas, parents, authors, dates', () => {
    expect(commits.length).toBeGreaterThan(20);
    for (const c of commits) {
      expect(c.id).toMatch(/^[0-9a-f]{40}$/);
      expect(c.shortHash).toBe(c.id.slice(0, 8));
      expect(c.author.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(c.date))).toBe(false);
    }
  });

  it('marks the octopus merge with 3 parents and no numstat totals', () => {
    const oct = commits.find((c) => c.msg.includes('octopus'));
    expect(oct).toBeDefined();
    expect(oct!.parents).toHaveLength(3);
    expect(oct!.merge).toBe(true);
    expect(oct!.add).toBeUndefined();
  });

  it('attaches numstat totals to non-merge commits', () => {
    const scaffold = commits.find((c) => c.msg === 'chore: initial scaffold');
    expect(scaffold).toBeDefined();
    expect(scaffold!.add).toBeGreaterThan(0);
    expect(scaffold!.parents).toHaveLength(0);
  });

  it('handles the binary commit (numstat dashes)', () => {
    const bin = commits.find((c) => c.msg === 'chore: add binary logo');
    expect(bin).toBeDefined();
    expect(bin!.add).toBe(0);
    expect(bin!.del).toBe(0);
  });

  it('returns [] for empty output', () => {
    expect(parseLog('')).toEqual([]);
  });
});

describe('parseRefs', () => {
  const refs = parseRefs(fixture('refs.txt'));

  it('splits locals, remotes, tags', () => {
    expect(refs.local.map((b) => b.name)).toContain('main');
    expect(refs.local.map((b) => b.name)).toContain('feature/search');
    expect(refs.remote.map((b) => b.name)).toContain('origin/main');
    expect(refs.tags.map((t) => t.name)).toEqual(expect.arrayContaining(['v0.1.0', 'v0.2.0']));
  });

  it('marks the current branch and parses ahead/behind', () => {
    const main = refs.local.find((b) => b.name === 'main')!;
    expect(main.current).toBe(true);
    expect(main.upstream).toBe('origin/main');
    expect(main.ahead).toBe(2);
    expect(main.behind).toBe(0);
  });

  it('peels annotated tags to the commit sha', () => {
    const v1 = refs.tags.find((t) => t.name === 'v0.1.0')!; // lightweight
    const v2 = refs.tags.find((t) => t.name === 'v0.2.0')!; // annotated
    expect(v1.tip).toBe(v2.tip); // both point at the same commit after peeling
  });

  it('parses [gone] upstream', () => {
    const out = parseRefs(
      'refs/heads/orphan\x1fdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\x1f\x1forigin/orphan\x1f[gone]\x1f2026-01-01T00:00:00+00:00\x1f \n',
    );
    expect(out.local[0]!.upstreamGone).toBe(true);
  });
});

describe('parseStatus', () => {
  const status = parseStatus(fixture('status.txt'));

  it('parses branch header and ahead/behind', () => {
    expect(status.branch).toBe('main');
    expect(status.ahead).toBe(2);
  });

  it('classifies staged, unstaged, untracked', () => {
    expect(status.staged.map((f) => f.path)).toContain('src/app.ts');
    expect(status.unstaged.map((f) => f.path)).toContain('src/helpers.ts');
    expect(status.untracked.map((f) => f.path)).toContain('TODO.txt');
  });

  it('parses renames with original path', () => {
    const ren = status.staged.find((f) => f.status === 'renamed')!;
    expect(ren.path).toBe('src/auth/jwt.ts');
    expect(ren.origPath).toBe('src/auth/token.ts');
  });

  it('handles detached head', () => {
    const out = parseStatus('# branch.oid abc\0# branch.head (detached)\0');
    expect(out.branch).toBeNull();
  });
});

describe('parseWorktrees', () => {
  it('parses main and linked worktrees', () => {
    const wts = parseWorktrees(fixture('worktrees.txt'));
    expect(wts).toHaveLength(2);
    expect(wts[0]!.path).toBe('/tmp/progit-rec');
    expect(wts[1]!.branch).toBe('feature/search');
    expect(wts[1]!.head).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('parseStashes', () => {
  const US = '\x1f';
  const RS = '\x1e';
  const sha = 'a'.repeat(40);
  const rec = (ref: string, subject: string, date: string) => `${ref}${US}${sha}${US}${subject}${US}${date}${RS}`;
  // git emits records newline-joined; the format terminates each with \x1e
  const out =
    rec('stash@{0}', 'WIP on main: 1ae932b release: v0.1.6', '2026-07-01T10:00:00+00:00') +
    '\n' +
    rec('stash@{1}', 'On feature/x: hand-written label', '2026-06-30T09:00:00+00:00') +
    '\n';

  it('parses each entry with ref, index, sha, and date', () => {
    const stashes = parseStashes(out);
    expect(stashes).toHaveLength(2);
    expect(stashes[0]!.ref).toBe('stash@{0}');
    expect(stashes[0]!.index).toBe(0);
    expect(stashes[1]!.index).toBe(1);
    expect(stashes[0]!.sha).toBe(sha);
    expect(Number.isNaN(Date.parse(stashes[0]!.date))).toBe(false);
  });

  it('extracts the source branch from both WIP and custom-message subjects', () => {
    const stashes = parseStashes(out);
    expect(stashes[0]!.branch).toBe('main');
    expect(stashes[1]!.branch).toBe('feature/x');
  });

  it('returns an empty list for no stashes', () => {
    expect(parseStashes('')).toEqual([]);
  });
});

describe('parseUnifiedDiff', () => {
  it('parses a staged diff with modify + rename', () => {
    const files = parseUnifiedDiff(fixture('diff-staged.txt'));
    const mod = files.find((f) => f.path === 'src/app.ts')!;
    expect(mod.status).toBe('modified');
    expect(mod.add).toBe(1);
    expect(mod.hunks).toHaveLength(1);
    expect(mod.hunks[0]!.lines.some((l) => l.t === 'add' && l.c.includes('staged change'))).toBe(true);
    const ren = files.find((f) => f.status === 'renamed')!;
    expect(ren.path).toBe('src/auth/jwt.ts');
    expect(ren.origPath).toBe('src/auth/token.ts');
    expect(ren.hunks).toHaveLength(0);
  });

  it('flags binary files', () => {
    const files = parseUnifiedDiff(fixture('diff-binary.txt'));
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('logo.png');
    expect(files[0]!.binary).toBe(true);
    expect(files[0]!.status).toBe('added');
  });

  it('marks no-newline-at-eof', () => {
    const files = parseUnifiedDiff(fixture('diff-no-newline.txt'));
    const lines = files[0]!.hunks[0]!.lines;
    expect(lines[lines.length - 1]!.noNewline).toBe(true);
  });

  it('tracks line numbers across hunks', () => {
    const out = parseUnifiedDiff(
      [
        'diff --git a/x.ts b/x.ts',
        'index 111..222 100644',
        '--- a/x.ts',
        '+++ b/x.ts',
        '@@ -10,3 +10,4 @@ ctx',
        ' line a',
        '-line b',
        '+line b2',
        '+line b3',
        ' line c',
        '',
      ].join('\n'),
    );
    const lines = out[0]!.hunks[0]!.lines;
    expect(lines[0]).toMatchObject({ t: 'ctx', o: 10, n: 10 });
    expect(lines[1]).toMatchObject({ t: 'del', o: 11 });
    expect(lines[2]).toMatchObject({ t: 'add', n: 11 });
    expect(lines[3]).toMatchObject({ t: 'add', n: 12 });
    expect(lines[4]).toMatchObject({ t: 'ctx', o: 12, n: 13 });
  });

  it('forces untracked status when requested', () => {
    const out = parseUnifiedDiff(
      ['diff --git a/new.txt b/new.txt', 'new file mode 100644', '--- /dev/null', '+++ b/new.txt', '@@ -0,0 +1 @@', '+hi', ''].join('\n'),
      'untracked',
    );
    expect(out[0]!.status).toBe('untracked');
  });
});
