/* Inline icon set, ported from the design prototype (icons.jsx). */

const ICON_PATHS: Record<string, string> = {
  chevron: 'M6 9l6 6 6-6',
  chevronR: 'M9 6l6 6-6 6',
  branch: 'M6 3v12M6 15a3 3 0 100 6 3 3 0 000-6zM6 3a3 3 0 100 0.01M18 6a3 3 0 100 6 3 3 0 000-6zm0 6c0 4-6 1-6 6',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  remote: 'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  tag: 'M3 11l8-8 10 10-8 8-10-10zM7 7h.01',
  stash: 'M4 7h16M4 12h16M4 17h16',
  cube: 'M21 7.5l-9-5-9 5 9 5 9-5zM3 7.5v9l9 5 9-5v-9M12 12.5v10',
  tree: 'M9 3h11M9 9h11M9 15h11M9 21h11M4 4h.01M4 10h.01M4 16h.01',
  worktree: 'M5 3v7m0 0a3 3 0 100 6 3 3 0 000-6zM19 8v6m0 0a3 3 0 100 6 3 3 0 000-6zM5 10c0 5 14 1 14 4',
  plus: 'M12 5v14M5 12h14',
  fetch: 'M21 12a9 9 0 11-3-6.7M21 4v4h-4',
  push: 'M12 19V5M5 12l7-7 7 7',
  pull: 'M12 5v14M5 12l7 7 7-7',
  check: 'M20 6L9 17l-5-5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  split: 'M3 4h18v16H3zM12 4v16',
  inline: 'M3 4h18v16H3zM3 10h18M3 15h18',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  folder: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  diff: 'M12 3v18M5 8H2m3 4H2m3 4H2m20-8h-3m3 4h-3m3 4h-3',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.09a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.09a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.09a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
};

export interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  fill?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 14, stroke = 1.6, fill, className, style }: IconProps) {
  const d = ICON_PATHS[name] ?? '';
  return (
    <svg
      className={'ic ' + (className ?? '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {d
        .split('M')
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={'M' + seg} />
        ))}
    </svg>
  );
}
