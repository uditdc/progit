import { describe, expect, it } from 'vitest';
import { wordDiff } from '../src/shared/word-diff.js';

const text = (segs: { x: string; h?: boolean }[] | undefined) => segs?.map((s) => s.x).join('') ?? null;
const hot = (segs: { x: string; h?: boolean }[] | undefined) => segs?.filter((s) => s.h).map((s) => s.x) ?? [];

describe('wordDiff', () => {
  it('highlights only the changed token', () => {
    const r = wordDiff('  return conv.messages[0]?.text ?? "Untitled";', '  return conv.messages[0]?.text ?? deriveTitle(conv);');
    expect(r).not.toBeNull();
    expect(text(r!.del)).toBe('  return conv.messages[0]?.text ?? "Untitled";');
    expect(text(r!.add)).toBe('  return conv.messages[0]?.text ?? deriveTitle(conv);');
    expect(hot(r!.del).join('')).toContain('"Untitled"');
    expect(hot(r!.add).join('')).toContain('deriveTitle');
    expect(hot(r!.add).join('')).not.toContain('return');
  });

  it('merges adjacent segments of the same kind', () => {
    const r = wordDiff('const a = 1;', 'const a = 2;')!;
    // expect few segments, not one per token
    expect(r.del.length).toBeLessThanOrEqual(3);
  });

  it('returns null for dissimilar lines', () => {
    expect(wordDiff('completely different content here', 'zzz qqq vvv')).toBeNull();
  });

  it('returns null for empty sides', () => {
    expect(wordDiff('', 'abc')).toBeNull();
  });

  it('round-trips exact reconstruction', () => {
    const a = 'function pull(session) { return fetch(URL); }';
    const b = 'async function pull(session) { const r = await fetch(URL, opts); }';
    const r = wordDiff(a, b);
    if (r) {
      expect(text(r.del)).toBe(a);
      expect(text(r.add)).toBe(b);
    }
  });
});
