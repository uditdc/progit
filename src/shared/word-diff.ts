import type { WordSegment } from './types.js';

function tokenize(s: string): string[] {
  return s.match(/\w+|\s+|[^\w\s]+/g) ?? [];
}

/** Longest common subsequence keep-flags for two token arrays. */
function lcsKeep(a: string[], b: string[]): [boolean[], boolean[]] {
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const keepA = new Array<boolean>(n).fill(false);
  const keepB = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keepA[i] = true;
      keepB[j] = true;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return [keepA, keepB];
}

function toSegments(tokens: string[], keep: boolean[]): WordSegment[] {
  const out: WordSegment[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const h = !keep[i];
    const last = out[out.length - 1];
    if (last && !!last.h === h) last.x += tokens[i]!;
    else out.push(h ? { x: tokens[i]!, h: true } : { x: tokens[i]! });
  }
  return out;
}

const MAX_TOKENS = 400;

/**
 * Word-level diff of a del/add line pair → highlight segments for each side.
 * Returns null when the lines are too dissimilar for intra-line marks to help.
 */
export function wordDiff(delLine: string, addLine: string): { del: WordSegment[]; add: WordSegment[] } | null {
  const a = tokenize(delLine);
  const b = tokenize(addLine);
  if (a.length === 0 || b.length === 0) return null;
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return null;
  const [keepA, keepB] = lcsKeep(a, b);
  const common = keepA.filter(Boolean).length;
  // require some real overlap, otherwise the whole line is one big highlight anyway
  if (common / Math.max(a.length, b.length) < 0.3) return null;
  return { del: toSegments(a, keepA), add: toSegments(b, keepB) };
}
