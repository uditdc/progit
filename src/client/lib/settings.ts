import React from 'react';

export type DiffMode = 'inline' | 'split';
export type Theme = 'light' | 'dark';

export interface Settings {
  diffMode: DiffMode;
  collapse: boolean;
  accent: string;
  theme: Theme;
  ignoreWhitespace: boolean;
  wordWrap: boolean;
}

/* Accents are hue-driven: each theme picks its own lightness so the same accent
   stays legible on both light and dark. `swatch` is just the picker preview. */
export interface Accent {
  swatch: string;
  h: number;
  c: number;
}

export const ACCENTS: Record<string, Accent> = {
  green: { swatch: 'oklch(0.72 0.16 150)', h: 150, c: 0.16 },
  blue: { swatch: 'oklch(0.64 0.16 245)', h: 245, c: 0.15 },
  purple: { swatch: 'oklch(0.64 0.17 300)', h: 300, c: 0.16 },
  orange: { swatch: 'oklch(0.68 0.15 65)', h: 65, c: 0.15 },
};

const DEFAULTS: Settings = {
  diffMode: 'inline',
  collapse: true,
  accent: 'green',
  theme: 'dark',
  ignoreWhitespace: false,
  wordWrap: false,
};
const KEY = 'progit_settings';

function load(): Settings {
  try {
    const next = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    if (!(next.accent in ACCENTS)) next.accent = DEFAULTS.accent;
    return next;
  } catch {
    return DEFAULTS;
  }
}

/** Apply theme + accent to the document before React renders, so there's no
    flash of the default theme on first paint or on the home screen. */
export function applyAppearance(): void {
  const s = load();
  const a = ACCENTS[s.accent] ?? ACCENTS.green!;
  const r = document.documentElement;
  r.setAttribute('data-theme', s.theme);
  r.style.setProperty('--accent-h', String(a.h));
  r.style.setProperty('--accent-c', String(a.c));
}

export function useSettings(): [Settings, <K extends keyof Settings>(k: K, v: Settings[K]) => void] {
  const [settings, setSettings] = React.useState<Settings>(load);
  const update = React.useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [k]: v };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  React.useEffect(() => {
    const a = ACCENTS[settings.accent] ?? ACCENTS.green!;
    const r = document.documentElement;
    r.style.setProperty('--accent-h', String(a.h));
    r.style.setProperty('--accent-c', String(a.c));
  }, [settings.accent]);
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);
  return [settings, update];
}
