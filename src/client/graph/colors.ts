/* Stable branch-name → color mapping, consistent across sessions and re-lanes.
   main/master is always the fixed green; every other branch rotates through a
   wide set of accent hues so colors rarely repeat. Branches already merged into
   main are faded by the caller via dimColor(). */

export const MAIN_COLOR = 'oklch(0.78 0.16 150)'; // green — reserved for main/master

/* Accent hues for non-main branches, kept clear of the main green so the trunk
   always reads as the green spine. 24 variations spread across the wheel. */
export const LANE_PALETTE = [
  'oklch(0.74 0.15 245)', // blue
  'oklch(0.74 0.16 300)', // purple
  'oklch(0.78 0.15 65)',  // orange
  'oklch(0.80 0.13 190)', // teal
  'oklch(0.72 0.16 22)',  // red
  'oklch(0.70 0.15 330)', // pink
  'oklch(0.84 0.14 95)',  // yellow
  'oklch(0.68 0.16 270)', // indigo
  'oklch(0.76 0.15 210)', // sky
  'oklch(0.72 0.17 350)', // rose
  'oklch(0.80 0.14 50)',  // amber
  'oklch(0.78 0.14 175)', // spring teal
  'oklch(0.70 0.18 315)', // magenta
  'oklch(0.74 0.17 8)',   // scarlet
  'oklch(0.70 0.15 230)', // azure
  'oklch(0.82 0.15 80)',  // gold
  'oklch(0.72 0.16 285)', // violet
  'oklch(0.76 0.15 40)',  // tangerine
  'oklch(0.80 0.15 110)', // lime
  'oklch(0.72 0.15 200)', // cyan
  'oklch(0.74 0.18 340)', // fuchsia
  'oklch(0.68 0.14 255)', // cobalt
  'oklch(0.76 0.16 18)',  // vermilion
  'oklch(0.78 0.14 105)', // chartreuse
];

const MAIN_NAMES = new Set(['main', 'master']);

/** Strip the remote prefix so origin/main and main share an identity. */
function normalizeBranch(name: string): string {
  return name.replace(/^[^/]+\//, (m) => (m === 'origin/' ? '' : m));
}

export function isMainBranch(name: string): boolean {
  return MAIN_NAMES.has(normalizeBranch(name));
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Color for a branch; main/master is always green, others hash into the palette. */
export function branchColor(name: string): string {
  const base = normalizeBranch(name);
  if (MAIN_NAMES.has(base)) return MAIN_COLOR;
  return LANE_PALETTE[fnv1a(base) % LANE_PALETTE.length]!;
}

/** Faded variant of a lane color, for branches already merged into main. */
export function dimColor(color: string): string {
  return color.replace(/oklch\(([^)]+)\)/, (_, body) => `oklch(${body} / 0.3)`);
}
