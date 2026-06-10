const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'long' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const secs = (Date.now() - t) / 1000;
  if (secs < 60) return 'now';
  for (const [unit, span] of UNITS) {
    if (secs >= span) {
      return rtf.format(-Math.round(secs / span), unit).replace(/^in /, '');
    }
  }
  return 'now';
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
