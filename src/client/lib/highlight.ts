/* Tiny syntax tokenizer, ported from the design prototype (util.js). */

export interface Token {
  c: string;
  t: string;
}

const KW = new Set(
  (
    'const let var function return if else for of in while export import from default ' +
    'async await class new type interface readonly extends implements public private static ' +
    'true false null undefined this void enum namespace require module def end fn pub use mod ' +
    'match impl struct trait where loop break continue elif lambda pass raise try except finally with as is not and or'
  ).split(' '),
);

const TOKEN_RE = /(\/\/.*$)|(`[^`]*`|"[^"]*"|'[^']*')|(\b\d[\d_.]*\b)|([A-Za-z_$][A-Za-z0-9_$]*)|(\s+)|([^\sA-Za-z0-9_$]+)/g;

export function highlight(lang: string, line: string): Token[] {
  if (lang === 'md' || lang === 'txt') return [{ c: 'tk-md', t: line }];
  const out: Token[] = [];
  const cmt = line.match(/^(\s*)(\/\/.*|#.*|\/\*.*\*\/)$/);
  if (cmt) {
    if (cmt[1]) out.push({ c: '', t: cmt[1] });
    out.push({ c: 'tk-cmt', t: cmt[2]! });
    return out;
  }
  const re = new RegExp(TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[1]) out.push({ c: 'tk-cmt', t: m[1] });
    else if (m[2]) out.push({ c: 'tk-str', t: m[2] });
    else if (m[3]) out.push({ c: 'tk-num', t: m[3] });
    else if (m[4]) {
      if (KW.has(m[4])) out.push({ c: 'tk-kw', t: m[4] });
      else if (/^[A-Z]/.test(m[4])) out.push({ c: 'tk-type', t: m[4] });
      else if (line[re.lastIndex] === '(') out.push({ c: 'tk-fn', t: m[4] });
      else out.push({ c: '', t: m[4] });
    } else if (m[5]) out.push({ c: '', t: m[5] });
    else if (m[6]) out.push({ c: 'tk-punc', t: m[6] });
  }
  return out;
}

const AV = [
  'oklch(0.7 0.13 150)',
  'oklch(0.7 0.13 245)',
  'oklch(0.7 0.13 300)',
  'oklch(0.72 0.13 65)',
  'oklch(0.7 0.13 20)',
  'oklch(0.72 0.13 195)',
];

export function avatarColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AV[h % AV.length]!;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
