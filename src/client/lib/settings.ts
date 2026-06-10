import React from 'react';

export type DiffMode = 'inline' | 'split';

export interface Settings {
  diffMode: DiffMode;
  collapse: boolean;
  accent: string;
}

export const ACCENTS: Record<string, [string, string, string]> = {
  '#5fd38d': ['oklch(0.80 0.16 150)', 'oklch(0.80 0.16 150 / 0.14)', 'oklch(0.80 0.16 150 / 0.45)'],
  '#5aa9f5': ['oklch(0.74 0.15 245)', 'oklch(0.74 0.15 245 / 0.16)', 'oklch(0.74 0.15 245 / 0.5)'],
  '#c08bf0': ['oklch(0.74 0.16 300)', 'oklch(0.74 0.16 300 / 0.16)', 'oklch(0.74 0.16 300 / 0.5)'],
  '#f0a55a': ['oklch(0.78 0.15 65)', 'oklch(0.78 0.15 65 / 0.16)', 'oklch(0.78 0.15 65 / 0.5)'],
};

const DEFAULTS: Settings = { diffMode: 'inline', collapse: true, accent: '#5fd38d' };
const KEY = 'progit_settings';

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
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
    const a = ACCENTS[settings.accent] ?? ACCENTS['#5fd38d']!;
    const r = document.documentElement;
    r.style.setProperty('--accent', a[0]);
    r.style.setProperty('--accent-dim', a[1]);
    r.style.setProperty('--accent-line', a[2]);
  }, [settings.accent]);
  return [settings, update];
}
