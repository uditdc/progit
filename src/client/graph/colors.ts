/* Stable branch-name → color mapping, consistent across sessions and re-lanes. */

export const LANE_PALETTE = [
  'oklch(0.78 0.16 150)', // green
  'oklch(0.74 0.15 245)', // blue
  'oklch(0.74 0.16 300)', // purple
  'oklch(0.78 0.15 65)',  // orange
  'oklch(0.80 0.13 190)', // teal
  'oklch(0.72 0.16 22)',  // red
  'oklch(0.70 0.15 330)', // pink
  'oklch(0.84 0.14 95)',  // yellow
];

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Color for a branch; the remote prefix is stripped so origin/main matches main. */
export function branchColor(name: string): string {
  const base = name.replace(/^[^/]+\//, (m) => (m === 'origin/' ? '' : m));
  return LANE_PALETTE[fnv1a(base) % LANE_PALETTE.length]!;
}
