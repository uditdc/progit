import type { StashEntry } from '../../shared/types.js';

export const STASH_FORMAT = '%gd%x1f%H%x1f%gs%x1f%cI%x1e';

const SELECTOR_RE = /^stash@\{(\d+)\}$/;
const SUBJECT_RE = /^(?:WIP on|On) ([^:]+):/;

/** Parses `git stash list --format=STASH_FORMAT` (records \x1e-terminated, fields \x1f). */
export function parseStashes(out: string): StashEntry[] {
  const entries: StashEntry[] = [];
  for (const raw of out.split('\x1e')) {
    const rec = raw.replace(/^\n+/, '');
    if (!rec.includes('\x1f')) continue;
    const f = rec.split('\x1f');
    if (f.length < 4) continue;
    const [ref, sha, message, date] = f as [string, string, string, string];
    const sel = SELECTOR_RE.exec(ref);
    if (!sel) continue;
    const branch = SUBJECT_RE.exec(message);
    entries.push({
      ref,
      index: Number(sel[1]),
      sha,
      message,
      branch: branch ? branch[1]! : null,
      date,
    });
  }
  return entries;
}
