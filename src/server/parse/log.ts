import type { Commit } from '../../shared/types.js';

export const LOG_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e';

const NUMSTAT_RE = /^(\d+|-)\t(\d+|-)\t/;

function parseFields(raw: string): Commit | null {
  const f = raw.split('\x1f');
  if (f.length < 6) return null;
  const [id, parents, author, email, date, msg] = f as [string, string, string, string, string, string];
  const parentList = parents.trim() ? parents.trim().split(' ') : [];
  return {
    id,
    shortHash: id.slice(0, 8),
    parents: parentList,
    author,
    email,
    date,
    msg,
    merge: parentList.length > 1 || undefined,
  };
}

function applyNumstat(commit: Commit, block: string): void {
  let add = 0;
  let del = 0;
  let any = false;
  for (const line of block.split('\n')) {
    const m = NUMSTAT_RE.exec(line);
    if (!m) continue;
    any = true;
    if (m[1] !== '-') add += Number(m[1]);
    if (m[2] !== '-') del += Number(m[2]);
  }
  if (any) {
    commit.add = add;
    commit.del = del;
  }
}

/** Parses `git log --pretty=format:%H%x1e --numstat` into per-commit add/del totals. */
export function parseLogStats(out: string): Record<string, { add: number; del: number }> {
  const stats: Record<string, { add: number; del: number }> = {};
  const chunks = out.split('\x1e');
  let prevSha: string | null = null;
  for (const chunk of chunks) {
    const nl = chunk.lastIndexOf('\n');
    const statBlock = nl === -1 ? '' : chunk.slice(0, nl);
    const sha = (nl === -1 ? chunk : chunk.slice(nl + 1)).trim();
    if (prevSha && statBlock) {
      const c: Commit = { id: prevSha, shortHash: '', parents: [], author: '', email: '', date: '', msg: '' };
      applyNumstat(c, statBlock);
      if (c.add !== undefined) stats[prevSha] = { add: c.add, del: c.del ?? 0 };
    }
    prevSha = /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  }
  return stats;
}

/**
 * Parses `git log --pretty=format:LOG_FORMAT [--numstat]` output.
 * With --numstat, each \x1e-terminated record is followed by that commit's
 * numstat block (absent for merge commits, where git suppresses the diff).
 */
export function parseLog(out: string): Commit[] {
  if (!out.trim()) return [];
  const chunks = out.split('\x1e');
  const commits: Commit[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    // numstat of the previous commit = everything up to the last newline
    const nl = chunk.lastIndexOf('\n');
    const statBlock = nl === -1 ? '' : chunk.slice(0, nl);
    const fields = nl === -1 ? chunk : chunk.slice(nl + 1);
    if (i > 0 && statBlock && commits.length > 0) {
      applyNumstat(commits[commits.length - 1]!, statBlock);
    }
    if (fields.includes('\x1f')) {
      const c = parseFields(fields);
      if (c) commits.push(c);
    }
  }
  return commits;
}
