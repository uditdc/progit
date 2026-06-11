/* The hero tree — ported from the design prototype (TreeGraph.jsx). */

import React from 'react';
import type { LanedCommit, ViewRef } from '../graph/lanes';
import { avatarColor, initials } from '../lib/highlight';
import { relativeTime } from '../lib/relative-time';
import { Icon } from './Icon';

const T_ROW = 52;
const REF_H = 14; // extra height for the secondary refs line
const REF_PULL = 10; // refs line tucks up under the main line
const T_BRK = 34;
const T_PAD = 30;
const T_GAP = 30;
const T_R = 6;
const RUN_MIN = 4; // collapse same-lane, ref-less runs of >= this many
const MAX_COL = 12; // lanes past this share the last column so the rail can't crowd out the card
const BEND = 26; // fixed height of the lane-change S-bend; edges are straight rails elsewhere

// Edges run as straight vertical rails in the outer (higher-column) lane and turn
// into the main lane through a short S confined to a BEND-tall band at the join.
function edgePathV(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `M${x1} ${y1} L${x2} ${y2}`;
  const k = Math.min(BEND, Math.abs(y2 - y1));
  if (x1 > x2) {
    // child is the side branch → straight down its lane, hook into the parent at the bottom
    const yb = y2 - k;
    const mid = y2 - k / 2;
    return `M${x1} ${y1} L${x1} ${yb} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
  }
  // parent is the side branch → hook out of the child at the top, then straight down its lane
  const yb = y1 + k;
  const mid = y1 + k / 2;
  return `M${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${yb} L${x2} ${y2}`;
}

export function TipCap({
  r,
  head,
  onBranchMenu,
}: {
  r: ViewRef;
  head: boolean;
  onBranchMenu?: (e: React.MouseEvent, r: ViewRef) => void;
}) {
  const branchish = r.type === 'local' || r.type === 'head' || r.type === 'remote';
  const handler =
    branchish && onBranchMenu
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          onBranchMenu(e, r);
        }
      : undefined;

  // tags — muted text + border, keep yellow tag glyph for identity
  if (r.type === 'tag')
    return (
      <span className="refmini" style={{ color: 'var(--tx-mid)', borderColor: 'var(--line)', background: 'var(--bg-2)' }}>
        <Icon name="tag" size={9} style={{ color: 'var(--yellow)', opacity: 0.85 }} /> {r.name}
      </span>
    );

  // remote tracking — muted
  if (r.type === 'remote')
    return (
      <span
        className="refmini"
        onClick={handler}
        onContextMenu={handler}
        style={{ cursor: handler ? 'pointer' : undefined, color: 'var(--tx-mid)', borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <Icon name="remote" size={9} style={{ opacity: 0.7 }} /> {r.name}
      </span>
    );

  const dot = r.color || 'var(--accent)';

  // checked-out branch — tree-lane color for text + border
  if (head)
    return (
      <span
        className="tipcap head"
        onClick={handler}
        onContextMenu={handler}
        style={{
          color: dot,
          borderColor: dot,
          background: 'color-mix(in oklch, ' + dot + ' 16%, var(--bg-2))',
          boxShadow: '0 0 0 2px color-mix(in oklch, ' + dot + ' 28%, transparent)',
          cursor: handler ? 'pointer' : undefined,
        }}
      >
        <span className="sw" style={{ background: dot }} />
        <span style={{ fontSize: 10 }}>★</span>
        {r.name}
      </span>
    );

  // other local branches — muted text + border, lane-color dot retained
  return (
    <span
      className="tipcap"
      onClick={handler}
      onContextMenu={handler}
      style={{
        color: 'var(--tx-mid)',
        borderColor: 'var(--line)',
        background: 'var(--bg-2)',
        fontWeight: 500,
        cursor: handler ? 'pointer' : undefined,
      }}
    >
      <span className="sw" style={{ background: dot }} />
      {r.name}
    </span>
  );
}

export interface TreeGraphProps {
  commits: LanedCommit[];
  selected: string | null;
  onSelect: (id: string) => void;
  hiliteSet: Set<string> | null;
  hiliteLane: number | null;
  onContext?: (e: React.MouseEvent, c: LanedCommit) => void;
  onBranchMenu?: (e: React.MouseEvent, r: ViewRef) => void;
  hasUncommitted: boolean;
  wdCount: number;
  collapseFocus: boolean;
  focusTipId: string | null;
  wdParentId: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

interface CommitItem {
  type: 'commit';
  c: LanedCommit;
  refs: boolean;
}
interface BreakItem {
  type: 'break';
  key: string;
  ids: string[];
  col: number;
}
type Item = CommitItem | BreakItem;
type LaidItem = Item & { y: number; rowTop: number; rowH: number };

export function TreeGraph({
  commits,
  selected,
  onSelect,
  hiliteSet,
  hiliteLane,
  onContext,
  onBranchMenu,
  hasUncommitted,
  wdCount,
  collapseFocus,
  focusTipId,
  wdParentId,
  hasMore,
  loadingMore,
  onLoadMore,
}: TreeGraphProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const commitYRef = React.useRef<Record<string, number>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const byId = React.useMemo(() => {
    const m = new Map<string, LanedCommit>();
    for (const c of commits) m.set(c.id, c);
    return m;
  }, [commits]);

  // reset expanded runs whenever the focus target changes
  React.useEffect(() => {
    setExpanded(new Set());
  }, [focusTipId, collapseFocus]);

  const maxCol = commits.reduce((m, c) => Math.max(m, c.col), 0);
  const laneX = (col: number) => T_PAD + Math.min(col, MAX_COL) * T_GAP;
  const railW = laneX(maxCol) + T_PAD;
  const cardLeft = railW + 8;

  // ---- build display items (commits + collapse breaks) ----
  const items: Item[] = [];
  if (!collapseFocus) {
    for (const c of commits) items.push({ type: 'commit', c, refs: c.refs.length > 0 });
  } else {
    let i = 0;
    while (i < commits.length) {
      const c = commits[i]!;
      if (c.refs.length > 0) {
        items.push({ type: 'commit', c, refs: true });
        i++;
        continue;
      }
      let j = i;
      while (j < commits.length && commits[j]!.col === c.col && commits[j]!.refs.length === 0) j++;
      const run = commits.slice(i, j);
      const key = 'brk:' + run[0]!.id + ':' + run[run.length - 1]!.id;
      if (run.length >= RUN_MIN && !expanded.has(key)) {
        items.push({ type: 'commit', c: run[0]!, refs: run[0]!.refs.length > 0 });
        items.push({ type: 'break', key, ids: run.slice(1, -1).map((x) => x.id), col: c.col });
        items.push({ type: 'commit', c: run[run.length - 1]!, refs: run[run.length - 1]!.refs.length > 0 });
      } else {
        for (const rc of run) items.push({ type: 'commit', c: rc, refs: rc.refs.length > 0 });
      }
      i = j;
    }
  }

  // ---- lay out Y (node dot stays centered on the first line) ----
  let cur = hasUncommitted ? T_ROW : 0;
  const commitY: Record<string, number> = {};
  const breakIdY: Record<string, number> = {};
  const laid: LaidItem[] = [];
  for (const it of items) {
    if (it.type === 'commit') {
      const h = T_ROW + (it.refs ? REF_H : 0);
      const y = cur + T_ROW / 2;
      commitY[it.c.id] = y;
      laid.push({ ...it, y, rowTop: cur, rowH: h });
      cur += h;
    } else {
      const y = cur + T_BRK / 2;
      for (const id of it.ids) breakIdY[id] = y;
      laid.push({ ...it, y, rowTop: cur, rowH: T_BRK });
      cur += T_BRK;
    }
  }
  const loadMoreTop = cur;
  if (hasMore) cur += T_BRK + 6;
  const totalH = cur + 12;
  const wdY = T_ROW / 2;
  commitYRef.current = commitY;

  const posY = (id: string): number | null => commitY[id] ?? breakIdY[id] ?? null;

  // ---- rivers (lane spans over visible items) ----
  const spans: Record<number, { min: number; max: number; color: string }> = {};
  for (const it of laid) {
    const col = it.type === 'commit' ? it.c.col : it.col;
    const fallback = it.type === 'commit' ? it.c.color : byId.get(it.ids[0] ?? '')?.color ?? 'var(--accent)';
    const s = spans[col] ?? { min: Infinity, max: -Infinity, color: fallback };
    s.min = Math.min(s.min, it.y);
    s.max = Math.max(s.max, it.y);
    if (it.type === 'commit') s.color = it.c.color;
    spans[col] = s;
  }

  // ---- edges ----
  interface Edge {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    child: string;
    parent: string;
    key: string;
    stub?: boolean;
  }
  const edges: Edge[] = [];
  for (const c of commits) {
    for (const pid of c.parents) {
      const parent = byId.get(pid);
      const y1 = posY(c.id);
      if (y1 == null) continue;
      if (!parent) {
        // parent outside the loaded window — short fading stub downward
        edges.push({
          x1: laneX(c.col),
          y1,
          x2: laneX(c.col),
          y2: y1 + 20,
          color: c.color,
          child: c.id,
          parent: pid,
          key: c.id + '-' + pid,
          stub: true,
        });
        continue;
      }
      const y2 = posY(pid);
      if (y2 == null || y1 === y2) continue;
      const color = c.col >= parent.col ? c.color : parent.color;
      edges.push({ x1: laneX(c.col), y1, x2: laneX(parent.col), y2, color, child: c.id, parent: pid, key: c.id + '-' + pid });
    }
  }

  const isHi = (id: string) => !hiliteSet || hiliteSet.has(id);
  const laneActive = (col: number) => hiliteLane == null || hiliteLane === col;

  // scroll: a selected commit wins (smooth); otherwise jump to the focus tip (instant)
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetId = selected ?? focusTipId;
    if (!targetId) return;
    const y = commitYRef.current[targetId];
    if (y == null) return;
    const frac = selected ? 0.5 : 0.28;
    el.scrollTo({ top: Math.max(0, y - el.clientHeight * frac), behavior: selected ? 'smooth' : 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTipId, selected]);

  // infinite scroll: pull the next window once the sentinel nears the viewport
  React.useEffect(() => {
    const root = scrollRef.current;
    const sentinel = loadMoreRef.current;
    if (!root || !sentinel || !hasMore || loadingMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root, rootMargin: '300px' },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, totalH, onLoadMore]);

  return (
    <div className="tree-scroll" ref={scrollRef}>
      {/* widen past the design's base column when many lanes would crush the text */}
      <div className="tree-wrap" style={{ maxWidth: Math.max(1100, railW + 720) }}>
        <div className="tree-inner" style={{ height: totalH }}>
          <svg className="tree-svg" width={railW} height={totalH}>
            {Object.entries(spans).map(([col, s]) => (
              <line
                key={'r' + col}
                className="river"
                x1={laneX(+col)}
                y1={s.min - 14}
                x2={laneX(+col)}
                y2={s.max + 14}
                stroke={s.color}
                strokeWidth={16}
                strokeLinecap="round"
                opacity={laneActive(+col) ? 0.1 : 0.03}
              />
            ))}
            {edges.map((e) => {
              if (e.stub)
                return (
                  <path
                    key={e.key}
                    className="edge"
                    d={`M${e.x1} ${e.y1 + T_R} L${e.x2} ${e.y2 + 8}`}
                    fill="none"
                    stroke={e.color}
                    strokeWidth={2}
                    strokeDasharray="2 4"
                    opacity={0.35}
                  />
                );
              const hot = hiliteSet ? hiliteSet.has(e.child) && hiliteSet.has(e.parent) : true;
              return (
                <path
                  key={e.key}
                  className="edge"
                  d={edgePathV(e.x1, e.y1, e.x2, e.y2)}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={hot ? 2.6 : 2}
                  opacity={hot ? 0.95 : 0.18}
                />
              );
            })}
            {hasUncommitted && wdParentId && commitY[wdParentId] != null && (
              <path
                d={`M${laneX(0)} ${wdY + T_R} L${laneX(byId.get(wdParentId)?.col ?? 0)} ${commitY[wdParentId]! - T_R}`}
                stroke="var(--orange)"
                strokeWidth={2}
                strokeDasharray="3 3"
                fill="none"
                opacity={0.7}
              />
            )}
            {hasUncommitted && (
              <circle cx={laneX(0)} cy={wdY} r={T_R} fill="var(--bg-0)" stroke="var(--orange)" strokeWidth={2} strokeDasharray="2.5 2" />
            )}
            {laid
              .filter((it): it is LaidItem & CommitItem => it.type === 'commit')
              .map(({ c, y }) => {
                const sel = selected === c.id;
                const hi = isHi(c.id);
                const head = c.refs.some((r) => r.type === 'head');
                return (
                  <g key={c.id} className="node" opacity={hi ? 1 : 0.22}>
                    {sel && <circle cx={laneX(c.col)} cy={y} r={T_R + 5} fill="none" stroke={c.color} strokeWidth={2} />}
                    {head && <circle cx={laneX(c.col)} cy={y} r={T_R + 5} fill={c.color} opacity={0.2} />}
                    <circle
                      cx={laneX(c.col)}
                      cy={y}
                      r={c.merge ? T_R - 1 : T_R}
                      fill={c.merge ? 'var(--bg-0)' : c.color}
                      stroke={c.color}
                      strokeWidth={c.merge ? 2.4 : head ? 2.4 : 2.2}
                    />
                    {c.merge && <circle cx={laneX(c.col)} cy={y} r={2} fill={c.color} />}
                  </g>
                );
              })}
          </svg>

          {/* uncommitted row */}
          {hasUncommitted && (
            <div
              className={'trow wd' + (selected === '__wd__' ? ' sel' : '')}
              style={{ top: 0, height: T_ROW, cursor: 'pointer' }}
              onClick={() => onSelect('__wd__')}
            >
              <div className="rowbg" />
              <div className="trow-main">
                <div className="railpad" style={{ width: cardLeft }} />
                <div className="card">
                  <span className="lanebar" style={{ background: 'var(--orange)' }} />
                  <span className="msg">
                    {wdCount} uncommitted change{wdCount === 1 ? '' : 's'}
                  </span>
                  <span className="refs">
                    <span
                      className="tipcap"
                      style={{ color: 'var(--orange)', borderColor: 'oklch(0.78 0.15 65 / .5)', background: 'oklch(0.78 0.15 65 / .14)' }}
                    >
                      working tree
                    </span>
                  </span>
                  <span className="spacer" />
                  {/* <span className="when">now</span> */}
                  {/* <span className="sha">·····</span> */}
                </div>
              </div>
            </div>
          )}

          {/* commit + break rows */}
          {laid.map((it) => {
            if (it.type === 'break') {
              return (
                <div
                  key={it.key}
                  className="tbreak"
                  style={{ top: it.y - T_BRK / 2, height: T_BRK }}
                  onClick={() => setExpanded((s) => new Set(s).add(it.key))}
                >
                  <div className="brk-pill" style={{ left: laneX(it.col) }}>
                    ⋯ {it.ids.length}
                  </div>
                  <div className="railpad" style={{ width: cardLeft }} />
                  <div className="brk-label">
                    {it.ids.length} more commit{it.ids.length === 1 ? '' : 's'} on this lane · show
                  </div>
                </div>
              );
            }
            const c = it.c;
            const sel = selected === c.id;
            const hi = isHi(c.id);
            return (
              <div
                key={c.id}
                className={'trow' + (c.merge ? ' mergerow' : '') + (sel ? ' sel' : '') + (hi ? '' : ' dim')}
                style={{ top: it.rowTop, height: it.rowH }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContext?.(e, c);
                }}
              >
                <div className="rowbg" />
                <div className="trow-main">
                  <div className="railpad" style={{ width: cardLeft }} />
                  <div className="card">
                    <span className="lanebar" style={{ background: c.color }} />
                    <span className="ava" style={{ background: avatarColor(c.email || c.author) }}>
                      {initials(c.author)}
                    </span>
                    <span className="msg">{c.msg}</span>
                    {/* <span className="auth">{c.author.split(' ')[0]}</span> */}
                    <span className="spacer" />
                    {c.add != null && (
                      <span className="stat">
                        <span className="a">+{c.add}</span> <span className="d">−{c.del}</span>
                      </span>
                    )}
                    <span className="when">{relativeTime(c.date)}</span>
                    {/* <span className="sha">{c.shortHash}</span> */}
                  </div>
                </div>
                {it.refs && (
                  <div className="trow-refs" style={{ paddingLeft: cardLeft + 48, marginTop: -REF_PULL }}>
                    {c.refs.map((r) => (
                      <TipCap key={r.type + r.name} r={r} head={r.type === 'head'} onBranchMenu={onBranchMenu} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* load-more row (history window) — auto-loads on scroll, click as fallback */}
          {hasMore && (
            <div ref={loadMoreRef} className="tbreak" style={{ top: loadMoreTop, height: T_BRK }} onClick={onLoadMore}>
              <div className="brk-pill" style={{ left: laneX(0) }}>⋯</div>
              <div className="railpad" style={{ width: cardLeft }} />
              <div className="brk-label">{loadingMore ? 'loading more commits…' : 'scroll to load more history'}</div>
            </div>
          )}

          {/* node hit-targets — only the dot opens the diff */}
          {laid
            .filter((it): it is LaidItem & CommitItem => it.type === 'commit')
            .map(({ c, y }) => (
              <div
                key={'h' + c.id}
                className="tnode-hit"
                style={{ left: laneX(c.col), top: y }}
                title={c.msg}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(c.id);
                }}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onContext?.(e, c);
                }}
              />
            ))}
          {hasUncommitted && (
            <div
              className="tnode-hit"
              style={{ left: laneX(0), top: wdY }}
              title="Working tree"
              onClick={(e) => {
                e.stopPropagation();
                onSelect('__wd__');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
