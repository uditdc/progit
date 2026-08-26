/* Lane assignment, ported from the design prototype (App3.jsx computeLanes) and
   hardened for real git graphs: the checked-out branch's first-parent chain is
   column 0 (the spine); other branches get columns ordered by fork depth. */

import type { Commit, GitRef, RefsPayload } from '../../shared/types';
import { branchColor, dimColor, isMainBranch } from './colors';

export type ViewRefType = 'head' | 'local' | 'remote' | 'tag';

export interface ViewRef {
  name: string;
  type: ViewRefType;
  color: string;
}

export interface LanedCommit extends Commit {
  col: number;
  color: string;
  refs: ViewRef[];
}

const GUARD = 200_000;

/** Visit-step counter for the memoized fork-depth walk, exposed only for perf regression tests. */
let forkDepthWalkSteps = 0;
export function __resetForkDepthWalkSteps(): void {
  forkDepthWalkSteps = 0;
}
export function __getForkDepthWalkSteps(): number {
  return forkDepthWalkSteps;
}

export function computeLanes(
  commits: Commit[],
  refs: RefsPayload,
  currentRef: string | null,
  detachedHead?: string,
): LanedCommit[] {
  const byId = new Map<string, Commit>();
  for (const c of commits) byId.set(c.id, c);

  // ---- branches whose tip is already contained in main get a faded color ----
  const mainRef =
    refs.local.find((b) => isMainBranch(b.name)) ?? refs.remote.find((b) => isMainBranch(b.name));
  const mainAncestry =
    mainRef && byId.has(mainRef.tip) ? computeAncestry(commits, mainRef.tip) : null;
  const laneColor = (name: string, tip: string): string => {
    const merged =
      !!mainAncestry && name !== currentRef && !isMainBranch(name) && mainAncestry.has(tip);
    return merged ? dimColor(branchColor(name)) : branchColor(name);
  };

  // ---- attach refs to commits by tip sha ----
  const refsByCommit = new Map<string, ViewRef[]>();
  const push = (sha: string, vr: ViewRef) => {
    const arr = refsByCommit.get(sha);
    if (arr) arr.push(vr);
    else refsByCommit.set(sha, [vr]);
  };
  for (const b of refs.local) push(b.tip, { name: b.name, type: b.name === currentRef ? 'head' : 'local', color: laneColor(b.name, b.tip) });
  for (const b of refs.remote) push(b.tip, { name: b.name, type: 'remote', color: laneColor(b.name, b.tip) });
  for (const t of refs.tags) push(t.tip, { name: t.name, type: 'tag', color: 'var(--yellow)' });

  // ---- pick the spine tip ----
  const current = currentRef ? refs.local.find((b) => b.name === currentRef) : undefined;
  const startTip =
    (current && byId.has(current.tip) && current.tip) ||
    (detachedHead && byId.has(detachedHead) && detachedHead) ||
    commits[0]?.id;
  const spineColor = current ? branchColor(current.name) : 'var(--accent)';

  const owner = new Map<string, number>();
  const ownerColor = new Map<string, string>();

  // trunk = first-parent chain from the checked-out tip
  const trunkIndex = new Map<string, number>();
  let id: string | undefined = startTip;
  let guard = 0;
  while (id && byId.has(id) && !owner.has(id) && guard++ < GUARD) {
    owner.set(id, 0);
    ownerColor.set(id, spineColor);
    trunkIndex.set(id, trunkIndex.size);
    id = byId.get(id)!.parents[0];
  }

  // ---- other branches, deduped by tip, ordered by fork depth then ahead ----
  interface Cand {
    ref: GitRef;
    depth: number;
    priority: number;
  }
  // Fork-depth resolution walks each ref's first-parent chain up to the trunk. Branches
  // sharing history (e.g. stacked feature branches, or old lines that never merged) would
  // otherwise re-walk the same shared chain once per ref. Memoize by commit sha, with path
  // compression, so any given commit is walked at most once across all candidate refs.
  const forkDepthMemo = new Map<string, number>();
  const forkDepth = (tip: string): number => {
    const path: string[] = [];
    let fid: string | undefined = tip;
    let g = 0;
    while (fid && byId.has(fid) && !trunkIndex.has(fid) && !forkDepthMemo.has(fid) && g++ < GUARD) {
      forkDepthWalkSteps++;
      path.push(fid);
      fid = byId.get(fid)!.parents[0];
    }
    const resolved =
      fid !== undefined && trunkIndex.has(fid)
        ? trunkIndex.get(fid)!
        : fid !== undefined && forkDepthMemo.has(fid)
          ? forkDepthMemo.get(fid)!
          : Number.MAX_SAFE_INTEGER;
    for (const p of path) forkDepthMemo.set(p, resolved);
    return resolved;
  };

  const seenTip = new Set<string>(startTip ? [startTip] : []);
  const cands: Cand[] = [];
  const addCand = (ref: GitRef, priority: number) => {
    if (!ref.tip || !byId.has(ref.tip) || seenTip.has(ref.tip)) return;
    if (currentRef && ref.name === currentRef) return;
    seenTip.add(ref.tip);
    const depth = forkDepth(ref.tip);
    cands.push({ ref, depth, priority });
  };
  for (const b of refs.local) addCand(b, 0);
  for (const b of refs.remote) addCand(b, 1);
  for (const t of refs.tags) addCand(t, 2);
  cands.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.depth - b.depth ||
      (b.ref.ahead ?? 0) - (a.ref.ahead ?? 0) ||
      a.ref.name.localeCompare(b.ref.name),
  );

  let nextCol = 1;
  for (const { ref } of cands) {
    const own: string[] = [];
    const seen = new Set<string>();
    const stack = [ref.tip];
    while (stack.length) {
      const x = stack.pop()!;
      if (!byId.has(x) || seen.has(x)) continue;
      seen.add(x);
      if (owner.has(x)) continue; // boundary: trunk or an earlier lane
      own.push(x);
      for (const p of byId.get(x)!.parents) stack.push(p);
    }
    if (!own.length) continue; // label-only ref (its commits live on another lane)
    const col = nextCol++;
    const color = laneColor(ref.name, ref.tip);
    for (const x of own) {
      owner.set(x, col);
      ownerColor.set(x, color);
    }
  }

  // ---- final sweep: anything still unowned inherits its first child's lane ----
  const childOf = new Map<string, string>();
  for (const c of commits) {
    for (const p of c.parents) {
      if (!childOf.has(p)) childOf.set(p, c.id);
    }
  }
  for (const c of commits) {
    if (owner.has(c.id)) continue;
    const child = childOf.get(c.id);
    if (child !== undefined && owner.has(child)) {
      owner.set(c.id, owner.get(child)!);
      ownerColor.set(c.id, ownerColor.get(child) ?? spineColor);
    } else {
      const col = nextCol++;
      owner.set(c.id, col);
      ownerColor.set(c.id, spineColor);
    }
  }

  return commits.map((c) => ({
    ...c,
    col: owner.get(c.id) ?? 0,
    color: ownerColor.get(c.id) ?? spineColor,
    refs: refsByCommit.get(c.id) ?? [],
  }));
}

/** All ancestors of tipId (inclusive), for lineage highlighting. */
export function computeAncestry(commits: Commit[], tipId: string): Set<string> {
  const byId = new Map<string, Commit>();
  for (const c of commits) byId.set(c.id, c);
  const seen = new Set<string>();
  const stack = [tipId];
  while (stack.length) {
    const id = stack.pop()!;
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    for (const p of byId.get(id)!.parents) stack.push(p);
  }
  return seen;
}
