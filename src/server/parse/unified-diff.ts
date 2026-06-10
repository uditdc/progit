import type { DiffLine, FileDiff, FileStatus, Hunk } from '../../shared/types.js';

const EXT_LANG: Record<string, string> = {
  ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
  json: 'json', md: 'md', markdown: 'md',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', xml: 'html', svg: 'html',
  py: 'py', rb: 'rb', go: 'go', rs: 'rs', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'cs',
  sh: 'sh', bash: 'sh', zsh: 'sh', fish: 'sh',
  yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql',
};

export function langOf(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return 'txt';
  return EXT_LANG[path.slice(dot + 1).toLowerCase()] ?? 'txt';
}

/** Unquotes git's C-style quoted paths ("a b\303\244.txt"). */
function unquote(p: string): string {
  if (!p.startsWith('"') || !p.endsWith('"')) return p;
  const inner = p.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch !== '\\') {
      bytes.push(ch.charCodeAt(0));
      continue;
    }
    const next = inner[++i]!;
    if (next === 'n') bytes.push(10);
    else if (next === 't') bytes.push(9);
    else if (next === 'r') bytes.push(13);
    else if (next === '\\' || next === '"') bytes.push(next.charCodeAt(0));
    else if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(inner[i + 1] ?? '')) oct += inner[++i];
      bytes.push(parseInt(oct, 8));
    } else bytes.push(next.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

function stripPrefix(p: string): string {
  return p.replace(/^[ab]\//, '');
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Parses `git diff` unified output into the FileDiff model.
 * Handles renames, new/deleted files, binary files, "\ No newline" markers.
 */
export function parseUnifiedDiff(out: string, forcedStatus?: FileStatus): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = out.split('\n');
  let cur: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let sawRename = false;

  const flush = () => {
    if (cur) files.push(cur);
    cur = null;
    hunk = null;
    sawRename = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('diff --git ')) {
      flush();
      // `diff --git a/<old> b/<new>` — split on " b/" boundary (quoted paths handled below
      // via ---/+++/rename lines, which are authoritative)
      const rest = line.slice('diff --git '.length);
      const m = /^(.*?) (b\/.*|"b\/.*)$/.exec(rest);
      const oldP = m ? stripPrefix(unquote(m[1]!)) : '';
      const newP = m ? stripPrefix(unquote(m[2]!)) : '';
      cur = {
        path: newP || oldP,
        lang: 'txt',
        status: forcedStatus ?? 'modified',
        add: 0,
        del: 0,
        hunks: [],
      };
      continue;
    }
    if (!cur) continue;
    const c: FileDiff = cur;

    if (line.startsWith('new file mode')) {
      if (!forcedStatus) c.status = 'added';
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      if (!forcedStatus) c.status = 'deleted';
      continue;
    }
    if (line.startsWith('rename from ')) {
      c.origPath = unquote(line.slice('rename from '.length));
      sawRename = true;
      if (!forcedStatus) c.status = 'renamed';
      continue;
    }
    if (line.startsWith('rename to ')) {
      c.path = unquote(line.slice('rename to '.length));
      continue;
    }
    if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      c.binary = true;
      continue;
    }
    if (line.startsWith('--- ')) {
      const p = unquote(line.slice(4));
      if (p !== '/dev/null' && !sawRename) c.origPath = undefined;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = unquote(line.slice(4));
      if (p !== '/dev/null') c.path = stripPrefix(p);
      c.lang = langOf(c.path);
      continue;
    }

    const hm = HUNK_RE.exec(line);
    if (hm) {
      oldNo = Number(hm[1]);
      newNo = Number(hm[3]);
      hunk = { header: line, lines: [] };
      c.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    if (line.startsWith('+')) {
      hunk.lines.push({ t: 'add', n: newNo++, c: line.slice(1) });
      c.add++;
    } else if (line.startsWith('-')) {
      hunk.lines.push({ t: 'del', o: oldNo++, c: line.slice(1) });
      c.del++;
    } else if (line.startsWith(' ')) {
      hunk.lines.push({ t: 'ctx', o: oldNo++, n: newNo++, c: line.slice(1) });
    } else if (line.startsWith('\\')) {
      const last = hunk.lines[hunk.lines.length - 1];
      if (last) last.noNewline = true;
    }
  }
  flush();
  for (const f of files) f.lang = langOf(f.path);
  return files;
}
