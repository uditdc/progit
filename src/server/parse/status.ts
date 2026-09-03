import type { ConflictKind, FileStatus, StatusFile, StatusPayload } from '../../shared/types.js';

function letterStatus(ch: string): FileStatus {
  switch (ch) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'renamed';
    default: return 'modified';
  }
}

/** Maps an unmerged entry's XY code (git status short-format) to a conflict kind. */
function conflictKind(xy: string): ConflictKind {
  switch (xy) {
    case 'DD': return 'both-deleted';
    case 'AA': return 'both-added';
    case 'AU': return 'added-by-us';
    case 'UA': return 'added-by-them';
    case 'DU': return 'deleted-by-us';
    case 'UD': return 'deleted-by-them';
    default: return 'both-modified'; // UU
  }
}

/** Parses `git status --porcelain=v2 -z --branch` output. */
export function parseStatus(out: string): StatusPayload {
  const payload: StatusPayload = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };
  const tokens = out.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (!tok) continue;
    if (tok.startsWith('# branch.head ')) {
      const head = tok.slice('# branch.head '.length);
      payload.branch = head === '(detached)' ? null : head;
    } else if (tok.startsWith('# branch.upstream ')) {
      payload.upstream = tok.slice('# branch.upstream '.length);
    } else if (tok.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(tok);
      if (m) {
        payload.ahead = Number(m[1]);
        payload.behind = Number(m[2]);
      }
    } else if (tok.startsWith('1 ')) {
      const f = tok.split(' ');
      const xy = f[1]!;
      const path = f.slice(8).join(' ');
      pushEntry(payload, xy, path);
    } else if (tok.startsWith('2 ')) {
      const f = tok.split(' ');
      const xy = f[1]!;
      const path = f.slice(9).join(' ');
      const origPath = tokens[++i];
      pushEntry(payload, xy, path, origPath);
    } else if (tok.startsWith('u ')) {
      const f = tok.split(' ');
      const xy = f[1]!;
      const path = f.slice(10).join(' ');
      payload.conflicted.push({ path, status: 'conflicted', conflictKind: conflictKind(xy) });
    } else if (tok.startsWith('? ')) {
      payload.untracked.push({ path: tok.slice(2), status: 'untracked' });
    }
  }
  return payload;
}

function pushEntry(payload: StatusPayload, xy: string, path: string, origPath?: string): void {
  const x = xy[0]!;
  const y = xy[1]!;
  if (x !== '.') {
    const file: StatusFile = { path, status: letterStatus(x) };
    if (origPath) file.origPath = origPath;
    payload.staged.push(file);
  }
  if (y !== '.') {
    payload.unstaged.push({ path, status: letterStatus(y) });
  }
}
