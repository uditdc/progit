/* The diff viewer — ported from the design prototype (DiffViewer.jsx),
   with word-level highlights computed lazily client-side. */

import React from 'react';
import type { DiffLine, FileDiff, WordSegment } from '../../shared/types';
import { wordDiff } from '../../shared/word-diff';
import { highlight } from '../lib/highlight';
import { Icon } from './Icon';
import type { DiffMode } from '../lib/settings';

export interface DiffGroup {
  label: string | null;
  files: FileDiff[];
  staged: boolean;
}

function splitPath(p: string): { dir: string; base: string } {
  const i = p.lastIndexOf('/');
  return i === -1 ? { dir: '', base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

function StatBar({ add, del }: { add: number; del: number }) {
  const total = Math.max(add + del, 1);
  const n = 5;
  const greens = Math.round((add / total) * n);
  const reds = Math.min(n - greens, Math.round((del / total) * n));
  const grey = n - greens - reds;
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < greens; i++) cells.push(<i key={'g' + i} style={{ background: 'var(--add)' }} />);
  for (let i = 0; i < reds; i++) cells.push(<i key={'r' + i} style={{ background: 'var(--del)' }} />);
  for (let i = 0; i < grey; i++) cells.push(<i key={'x' + i} style={{ background: 'var(--bg-3)' }} />);
  return <span className="statbar">{cells}</span>;
}

function StatusIco({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    modified: ['M', 'st-modified'],
    added: ['A', 'st-added'],
    deleted: ['D', 'st-deleted'],
    renamed: ['R', 'st-modified'],
    untracked: ['U', 'st-untracked'],
    conflicted: ['!', 'st-deleted'],
  };
  const [ch, cls] = map[status] ?? ['M', 'st-modified'];
  return <span className={'stico ' + cls}>{ch}</span>;
}

function Segments({ line, lang }: { line: DiffLine; lang: string }) {
  if (line.words) {
    return (
      <>
        {line.words.map((w, i) =>
          w.h ? (
            <span key={i} className="whl">
              {w.x}
            </span>
          ) : (
            <span key={i}>{w.x}</span>
          ),
        )}
      </>
    );
  }
  const toks = highlight(lang, line.c);
  return (
    <>
      {toks.map((t, i) => (
        <span key={i} className={t.c}>
          {t.t}
        </span>
      ))}
    </>
  );
}

/** Pairs i-th del with i-th add inside each change run and attaches word segments. */
function enrichWords(lines: DiffLine[]): DiffLine[] {
  const out = lines.map((l) => ({ ...l }));
  let i = 0;
  while (i < out.length) {
    if (out[i]!.t !== 'del') {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && out[j]!.t === 'del') j++;
    let k = j;
    while (k < out.length && out[k]!.t === 'add') k++;
    const dels = out.slice(i, j);
    const adds = out.slice(j, k);
    const n = Math.min(dels.length, adds.length);
    for (let p = 0; p < n; p++) {
      const seg = wordDiff(dels[p]!.c, adds[p]!.c);
      if (seg) {
        dels[p]!.words = seg.del as WordSegment[];
        adds[p]!.words = seg.add as WordSegment[];
      }
    }
    i = k;
  }
  return out;
}

interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  ctx?: boolean;
}

function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];
  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      rows.push({ left: dels[i] ?? null, right: adds[i] ?? null });
    }
    dels = [];
    adds = [];
  };
  for (const l of lines) {
    if (l.t === 'del') dels.push(l);
    else if (l.t === 'add') adds.push(l);
    else {
      flush();
      rows.push({ left: l, right: l, ctx: true });
    }
  }
  flush();
  return rows;
}

type FoldBlock = { type: 'lines'; lines: DiffLine[] } | { type: 'fold'; count: number; lines: DiffLine[] };

function foldHunkLines(lines: DiffLine[]): FoldBlock[] {
  const out: FoldBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.t === 'ctx') {
      let j = i;
      while (j < lines.length && lines[j]!.t === 'ctx') j++;
      const run = lines.slice(i, j);
      if (run.length > 6 && i !== 0 && j !== lines.length) {
        out.push({ type: 'lines', lines: run.slice(0, 2) });
        out.push({ type: 'fold', count: run.length - 4, lines: run.slice(2, -2) });
        out.push({ type: 'lines', lines: run.slice(-2) });
      } else {
        out.push({ type: 'lines', lines: run });
      }
      i = j;
    } else {
      let j = i;
      while (j < lines.length && lines[j]!.t !== 'ctx') j++;
      out.push({ type: 'lines', lines: lines.slice(i, j) });
      i = j;
    }
  }
  return out;
}

function InlineLines({ lines, lang }: { lines: DiffLine[]; lang: string }) {
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className={'cline ' + l.t}>
          <span className="gutter">
            <span className="gn">{l.t === 'add' ? '' : l.o ?? ''}</span>
            <span className="gn">{l.t === 'del' ? '' : l.n ?? ''}</span>
          </span>
          <span className="sign">{l.t === 'add' ? '+' : l.t === 'del' ? '−' : ''}</span>
          <span className="ctext">
            <Segments line={l} lang={lang} />
          </span>
        </div>
      ))}
    </>
  );
}

function FileDiffView({
  file,
  mode,
  staged,
  staging,
  onStage,
  open,
  onToggle,
  innerRef,
}: {
  file: FileDiff;
  mode: DiffMode;
  staged: boolean;
  staging: boolean;
  onStage?: (file: FileDiff, staged: boolean) => void;
  open: boolean;
  onToggle: () => void;
  innerRef?: (el: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const { dir, base } = splitPath(file.path);
  const hunks = React.useMemo(
    () => (open ? file.hunks.map((h) => ({ ...h, lines: enrichWords(h.lines) })) : file.hunks),
    [file, open],
  );
  return (
    <div className="diff-file" ref={innerRef}>
      <div className={'diff-file-head' + (open ? '' : ' collapsed')} onClick={onToggle}>
        {staging && onStage && (
          <span
            className={'cbx sm' + (staged ? ' on' : '')}
            title={staged ? 'Exclude from commit' : 'Include in commit'}
            onClick={(e) => {
              e.stopPropagation();
              onStage(file, staged);
            }}
          >
            {staged && <Icon name="check" size={10} />}
          </span>
        )}
        <Icon name="chevron" size={13} className="chev" />
        <StatusIco status={file.status} />
        <span className="fpath">
          <span className="dir">{dir}</span>
          {base}
          {file.origPath && <span className="dir"> ← {file.origPath}</span>}
        </span>
        <span className="ff">
          <span className="diff-stat">
            <span className="a">+{file.add}</span>
            <span className="d">−{file.del}</span>
            <StatBar add={file.add} del={file.del} />
          </span>
        </span>
      </div>
      {open && file.binary && (
        <div className="code">
          <div className="collapsed-ctx" style={{ cursor: 'default' }}>
            Binary file{file.status === 'added' ? ' (new)' : ''} — no text diff
          </div>
        </div>
      )}
      {open && !file.binary && (
        <div className="code">
          {hunks.map((h, hi) => {
            if (mode === 'split') {
              const rows = toSplitRows(h.lines);
              return (
                <div key={hi}>
                  <div className="hunk-head">
                    <span className="hx mono">{h.header}</span>
                  </div>
                  <div className="split">
                    <div className="side">
                      {rows.map((r, ri) => (
                        <div key={ri} className={'sline ' + (r.left ? (r.ctx ? '' : r.left.t) : 'empty')}>
                          <span className="gn">{r.left ? r.left.o ?? '' : ''}</span>
                          <span className="ctext">{r.left && <Segments line={r.left} lang={file.lang} />}</span>
                        </div>
                      ))}
                    </div>
                    <div className="side">
                      {rows.map((r, ri) => (
                        <div key={ri} className={'sline ' + (r.right ? (r.ctx ? '' : r.right.t) : 'empty')}>
                          <span className="gn">{r.right ? r.right.n ?? '' : ''}</span>
                          <span className="ctext">{r.right && <Segments line={r.right} lang={file.lang} />}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }
            const blocks = foldHunkLines(h.lines);
            return (
              <div key={hi}>
                <div className="hunk-head">
                  <span className="gutter mono">⋯</span>
                  <span className="hx mono">{h.header}</span>
                </div>
                {blocks.map((b, bi) => {
                  if (b.type === 'fold') {
                    const key = hi + '-' + bi;
                    return expanded[key] ? (
                      <InlineLines key={bi} lines={b.lines} lang={file.lang} />
                    ) : (
                      <div key={bi} className="collapsed-ctx" onClick={() => setExpanded((e) => ({ ...e, [key]: true }))}>
                        <Icon name="chevron" size={12} /> Expand {b.count} unchanged lines
                      </div>
                    );
                  }
                  return <InlineLines key={bi} lines={b.lines} lang={file.lang} />;
                })}
              </div>
            );
          })}
          {hunks.length === 0 && (
            <div className="collapsed-ctx" style={{ cursor: 'default' }}>
              {file.status === 'renamed' ? 'Renamed without content changes' : 'No content changes'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface DiffViewerProps {
  groups: DiffGroup[];
  mode: DiffMode;
  staging: boolean;
  onStage?: (file: FileDiff, staged: boolean) => void;
  onStageAll?: (files: FileDiff[], staged: boolean) => void;
  /** When set, expand this file and scroll it into view; bump focusNonce to re-trigger. */
  focusPath?: string | null;
  focusNonce?: number;
}

export function DiffViewer({ groups, mode, staging, onStage, onStageAll, focusPath, focusNonce }: DiffViewerProps) {
  const allFiles = groups.flatMap((g) => g.files);
  const totals = allFiles.reduce((a, f) => ({ add: a.add + f.add, del: a.del + f.del }), { add: 0, del: 0 });
  const stagedFiles = groups.filter((g) => g.staged).flatMap((g) => g.files);
  const unstagedFiles = groups.filter((g) => !g.staged).flatMap((g) => g.files);
  const allStaged = allFiles.length > 0 && unstagedFiles.length === 0;

  // files start collapsed; keys present in the map override the default
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const isOpen = (f: FileDiff) => open[f.path] ?? false;
  const expandAll = () => setOpen(Object.fromEntries(allFiles.map((f) => [f.path, true])));
  const collapseAll = () => setOpen({});

  // a file clicked in the working-tree view: expand it and bring it into view
  const fileRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  React.useEffect(() => {
    if (!focusPath) return;
    setOpen((m) => (m[focusPath] ? m : { ...m, [focusPath]: true }));
    fileRefs.current[focusPath]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPath, focusNonce]);

  return (
    <>
      <div className="diff-toolbar">
        {staging && onStageAll && allFiles.length > 0 && (
          <label
            className="chk"
            style={{ margin: 0 }}
            title={allStaged ? 'Unstage all files' : 'Stage all files'}
            onClick={() => (allStaged ? onStageAll(stagedFiles, true) : onStageAll(unstagedFiles, false))}
          >
            <span className={'cbx sm' + (allStaged ? ' on' : '')}>{allStaged && <Icon name="check" size={10} />}</span>
            <span style={{ fontSize: 12.5, color: 'var(--tx-mid)' }}>All</span>
          </label>
        )}
        <span className="diff-stat tnum">
          <span className="a">+{totals.add}</span>
          <span className="d">−{totals.del}</span>
          <span style={{ color: 'var(--tx-lo)' }}>
            · {allFiles.length} file{allFiles.length === 1 ? '' : 's'}
          </span>
        </span>
        <span style={{ flex: 1 }} />
        <div className="seg">
          <button onClick={expandAll}>
            <Icon name="chevron" size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            Expand all
          </button>
          <button onClick={collapseAll}>
            <Icon name="chevronR" size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            Collapse all
          </button>
        </div>
      </div>

      <div className="detail-body">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && (
              <div className="files-group-label">
                {g.label}
                <span style={{ color: 'var(--tx-lo)' }}>· {g.files.length}</span>
              </div>
            )}
            {g.files.map((f) => (
              <FileDiffView
                key={f.path + (g.staged ? '-s' : '')}
                file={f}
                mode={mode}
                staged={g.staged}
                staging={staging}
                onStage={onStage}
                open={isOpen(f)}
                onToggle={() => setOpen((m) => ({ ...m, [f.path]: !isOpen(f) }))}
                innerRef={(el) => {
                  fileRefs.current[f.path] = el;
                }}
              />
            ))}
          </div>
        ))}
        {allFiles.length === 0 && (
          <div className="detail-empty">
            <div>
              <div className="big">∅</div>
              No changes
            </div>
          </div>
        )}
      </div>
    </>
  );
}
