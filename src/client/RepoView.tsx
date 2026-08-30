/* Repository view — the v3 tree-as-hero shell, scoped to one repo path. */

import React from 'react';
import type { FileDiff, GitRef, StashEntry, Worktree } from '../shared/types';
import { computeAncestry, computeLanes, type LanedCommit, type ViewRef } from './graph/lanes';
import { branchColor, LANE_PALETTE } from './graph/colors';
import {
  useGitActions,
  useCommitDiff,
  useLog,
  useLogStats,
  useRefs,
  useRepo,
  useStashes,
  useStatus,
  useWorkingDiff,
  useWorktrees,
} from './api/queries';
import { useLiveUpdates } from './api/events';
import { ACCENTS, useSettings } from './lib/settings';
import { avatarColor, initials } from './lib/highlight';
import { shortDate } from './lib/relative-time';
import { navigateHome, pushRecentRepo } from './lib/router';
import { Icon } from './components/Icon';
import { TreeGraph } from './components/TreeGraph';
import { DiffViewer, type DiffGroup } from './components/DiffViewer';
import { Pop } from './components/Popover';
import { ContextMenu, type MenuAction } from './components/ContextMenu';
import { CreateRefDialog } from './components/CreateRefDialog';
import { CredentialDialog } from './components/CredentialDialog';
import { api } from './api/client';

const LOG_FIRST = 20; // small first page for a fast initial paint
const LOG_STEP = 50; // each infinite-scroll fetch grows the window by this much

function RefMini({ r }: { r: ViewRef }) {
  if (r.type === 'tag')
    return (
      <span className="refmini" style={{ color: 'var(--tx-mid)', borderColor: 'var(--line)' }}>
        <Icon name="tag" size={9} style={{ color: 'var(--yellow)', opacity: 0.85 }} /> {r.name}
      </span>
    );
  if (r.type === 'remote')
    return (
      <span className="refmini" style={{ color: 'var(--tx-mid)', borderColor: 'var(--line)' }}>
        <Icon name="remote" size={9} style={{ opacity: 0.7 }} /> {r.name}
      </span>
    );
  const dot = r.color || 'var(--accent)';
  if (r.type === 'head')
    return (
      <span className="refmini" style={{ color: dot, borderColor: dot, background: 'color-mix(in oklch, ' + dot + ' 14%, var(--bg-2))' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} /> ★ {r.name}
      </span>
    );
  return (
    <span className="refmini" style={{ color: 'var(--tx-mid)', borderColor: 'var(--line)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} /> {r.name}
    </span>
  );
}

// strip the "WIP on <branch>: <sha> " / "On <branch>: " reflog prefix — the branch
// is shown separately, so the label reads as just the change description
function stashLabel(s: StashEntry): string {
  const m = /^(?:WIP on|On) [^:]+:\s*(?:[0-9a-f]{7,40}\s+)?(.*)$/.exec(s.message);
  const rest = m?.[1]?.trim();
  return rest && rest.length ? rest : s.message;
}

interface ToastState {
  msg: string;
  error?: boolean;
}

export function RepoView({ repoPath }: { repoPath: string }) {
  const [credReq, setCredReq] = React.useState<{ id: string; prompt: string } | null>(null);
  useLiveUpdates(repoPath, (e) => setCredReq({ id: e.id, prompt: e.prompt }));
  const [settings, setSetting] = useSettings();

  const repoQ = useRepo(repoPath);
  const [limit, setLimit] = React.useState(LOG_FIRST);
  const loadMore = React.useCallback(() => setLimit((l) => l + LOG_STEP), []);
  const logQ = useLog(repoPath, limit);
  const statsQ = useLogStats(repoPath, limit);
  const refsQ = useRefs(repoPath);
  const statusQ = useStatus(repoPath);
  const worktreesQ = useWorktrees(repoPath);
  const stashesQ = useStashes(repoPath);

  const repo = repoQ.data;
  const commits = React.useMemo(() => {
    const list = logQ.data?.commits ?? [];
    const stats = statsQ.data;
    if (!stats) return list;
    return list.map((c) => (c.add == null && stats[c.id] ? { ...c, ...stats[c.id] } : c));
  }, [logQ.data, statsQ.data]);
  const refs = React.useMemo(() => refsQ.data ?? { local: [], remote: [], tags: [] }, [refsQ.data]);
  const status = statusQ.data;
  const worktrees = worktreesQ.data ?? [];
  const stashes = stashesQ.data ?? [];

  // remember successfully opened repos for the home screen
  React.useEffect(() => {
    if (repo) pushRecentRepo(repo.path, repo.name);
  }, [repo]);

  const [selected, setSelected] = React.useState<string | null>(null);
  const [peekWt, setPeekWt] = React.useState<string | null>(null);
  const [hoverBranch, setHoverBranch] = React.useState<string | null>(null);
  const [brQuery, setBrQuery] = React.useState('');
  const [brPop, setBrPop] = React.useState(false);
  const [setPop, setSetPop] = React.useState(false);
  const [ctx, setCtx] = React.useState<{ x: number; y: number; c: LanedCommit } | null>(null);
  const [branchMenu, setBranchMenu] = React.useState<{ x: number; y: number; ref: ViewRef } | null>(null);
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const [dialog, setDialog] = React.useState<{ kind: 'branch' | 'tag'; baseId: string | null } | null>(null);
  const [commitTitle, setCommitTitle] = React.useState('');
  const [commitBody, setCommitBody] = React.useState('');
  const [amend, setAmend] = React.useState(false);

  const [drawerW, setDrawerW] = React.useState<number>(() => Number(localStorage.getItem('progit_diff_w')) || 0);
  const [resizing, setResizing] = React.useState(false);
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const onMove = (ev: MouseEvent) => {
      // keep the overlay wide (≥55% of the window) so the tree graph still reads on the left
      const w = Math.min(Math.max(window.innerWidth - ev.clientX, window.innerWidth * 0.55), window.innerWidth - 280);
      setDrawerW(w);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setResizing(false);
      setDrawerW((w) => {
        if (w) localStorage.setItem('progit_diff_w', String(w));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = React.useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), error ? 4200 : 1800);
  }, []);

  const actions = useGitActions(repoPath, {
    onSuccess: (m) => flash(m),
    onError: (m) => flash(m, true),
  });

  const currentBranch = repo?.branch ?? null;
  const currentLabel = currentBranch ?? (repo?.head ? `detached @ ${repo.head.slice(0, 8)}` : '…');
  const currentColor = currentBranch ? branchColor(currentBranch) : 'var(--accent)';

  // ---- laned graph ----
  const laned = React.useMemo(
    () => computeLanes(commits, refs, currentBranch, refsQ.data?.detachedHead),
    [commits, refs, currentBranch, refsQ.data?.detachedHead],
  );
  const lanedById = React.useMemo(() => {
    const m = new Map<string, LanedCommit>();
    for (const c of laned) m.set(c.id, c);
    return m;
  }, [laned]);

  const tipOf = React.useCallback(
    (name: string) => [...refs.local, ...refs.remote, ...refs.tags].find((b) => b.name === name)?.tip ?? null,
    [refs],
  );

  // hover preview (from Branches popover): dim to ancestry
  const ancestry = React.useMemo(() => {
    if (!hoverBranch) return null;
    const tip = tipOf(hoverBranch);
    return tip ? computeAncestry(commits, tip) : null;
  }, [hoverBranch, tipOf, commits]);
  const activeLane = hoverBranch ? lanedById.get(tipOf(hoverBranch) ?? '')?.col ?? null : null;

  const focusTipId = currentBranch ? tipOf(currentBranch) : repo?.head ?? null;

  const wdCount = status ? status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length : 0;
  const hasUncommitted = wdCount > 0;

  // nothing to push once the branch is tracking a remote and isn't ahead of it
  const nothingToPush = Boolean(status?.upstream) && status?.ahead === 0;

  // ---- detail / drawer ----
  const peekObj = peekWt ? worktrees.find((w) => w.path === peekWt) ?? null : null;
  const selectedSha = selected && selected !== '__wd__' ? selected : null;
  const commitDiffQ = useCommitDiff(repoPath, selectedSha);
  const workingDiffQ = useWorkingDiff(repoPath, hasUncommitted || peekObj !== null, peekObj?.path);

  // one row per uncommitted file for the working-tree node; a partially staged
  // file appears once with its staged + unstaged stats combined
  const wdFiles = React.useMemo(() => {
    const d = workingDiffQ.data;
    if (!d || peekObj) return [];
    const byPath = new Map<string, FileDiff>();
    for (const f of [...d.staged, ...d.unstaged, ...d.untracked]) {
      const prev = byPath.get(f.path);
      byPath.set(f.path, prev ? { ...prev, add: prev.add + f.add, del: prev.del + f.del } : f);
    }
    return [...byPath.values()];
  }, [workingDiffQ.data, peekObj]);

  // a working-tree file the user clicked to focus in the diff; nonce re-triggers the scroll
  const [wdFocus, setWdFocus] = React.useState<{ path: string; n: number } | null>(null);

  const selectCommit = React.useCallback((id: string) => {
    setSelected(id);
    setPeekWt(null);
    if (id === '__wd__') setWdFocus(null);
  }, []);
  const selectWdFile = React.useCallback((path: string) => {
    setSelected('__wd__');
    setPeekWt(null);
    setWdFocus((p) => ({ path, n: (p?.n ?? 0) + 1 }));
  }, []);
  const closeDrawer = React.useCallback(() => {
    setSelected(null);
    setPeekWt(null);
  }, []);

  const onCheckout = (name: string) => {
    actions.checkout.mutate({ ref: name });
    setSelected(null);
    setPeekWt(null);
    setBrPop(false);
    setBranchMenu(null);
    setHoverBranch(null);
  };
  const onPeekWt = (w: Worktree) => {
    if (w.current) {
      setPeekWt(null);
      setSelected(null);
    } else {
      setPeekWt(w.path);
      setSelected(null);
    }
    setBrPop(false);
  };

  const onPopStash = (s: StashEntry) => {
    actions.stashPop.mutate({ ref: s.ref });
    setBrPop(false);
    setBrQuery('');
  };
  const onDropStash = (s: StashEntry) => actions.stashDrop.mutate({ ref: s.ref });

  const openCreate = (kind: 'branch' | 'tag', baseId: string | null) => {
    setCtx(null);
    setBranchMenu(null);
    setBrPop(false);
    setDialog({ kind, baseId: baseId ?? focusTipId });
  };
  const createRef = (kind: 'branch' | 'tag', baseId: string | null, name: string, checkout: boolean) => {
    const target = baseId ?? 'HEAD';
    if (kind === 'branch') actions.createBranch.mutate({ name, startPoint: target, checkout });
    else actions.createTag.mutate({ name, target });
    setDialog(null);
  };

  // stage/unstage — renames need both paths when unstaging
  const stagePaths = (f: FileDiff) => [f.path];
  const unstagePaths = (f: FileDiff) => (f.origPath ? [f.path, f.origPath] : [f.path]);
  // paths the user deliberately excluded from the next commit; nothing here is
  // actually staged in git until the commit action runs — this is UI state only
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const onStage = (f: FileDiff, staged: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (staged) next.add(f.path);
      else next.delete(f.path);
      return next;
    });
  };
  const onStageAll = (files: FileDiff[], staged: boolean) => {
    if (!files.length) return;
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const f of files) (staged ? next.add(f.path) : next.delete(f.path));
      return next;
    });
  };

  // files that will be included in the next commit — everything uncommitted
  // except what the user deliberately excluded; purely a client-side preview
  const previewIncluded = React.useMemo(() => {
    const d = workingDiffQ.data;
    if (!d || peekObj) return [] as FileDiff[];
    const byPath = new Map<string, FileDiff>();
    for (const f of [...d.staged, ...d.unstaged, ...d.untracked]) {
      if (!excluded.has(f.path)) byPath.set(f.path, f);
    }
    return [...byPath.values()];
  }, [workingDiffQ.data, peekObj, excluded]);
  const stagedCount = previewIncluded.length;
  const canCommit = amend ? !actions.commit.isPending : Boolean(stagedCount && commitTitle.trim());
  const doCommit = async () => {
    if (!canCommit) return;
    const title = commitTitle.trim();
    const body = commitBody.trim();
    // stage exactly what the preview showed — and unstage anything excluded
    // that happens to already be staged — right before committing
    const d = workingDiffQ.data;
    if (d) {
      const toStage = [...d.unstaged, ...d.untracked].filter((f) => !excluded.has(f.path)).flatMap(stagePaths);
      const toUnstage = d.staged.filter((f) => excluded.has(f.path)).flatMap(unstagePaths);
      if (toStage.length) await actions.stage.mutateAsync({ paths: [...new Set(toStage)] });
      if (toUnstage.length) await actions.unstage.mutateAsync({ paths: [...new Set(toUnstage)] });
    }
    actions.commit.mutate(
      { message: body ? `${title}\n\n${body}` : title, amend },
      {
        onSuccess: () => {
          setCommitTitle('');
          setCommitBody('');
          setAmend(false);
          setExcluded(new Set());
        },
      },
    );
  };

  const doStash = () => {
    const message = commitTitle.trim();
    actions.stashPush.mutate(
      { message: message || undefined, includeUntracked: true },
      {
        onSuccess: () => {
          setCommitTitle('');
          setCommitBody('');
          setAmend(false);
        },
      },
    );
  };

  const answerCredential = (value: string) => {
    if (!credReq) return;
    api.answerCredential({ requestId: credReq.id, value }).catch(() => {});
    setCredReq(null);
  };

  // keyboard nav
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer();
        setBranchMenu(null);
        setCtx(null);
        setDialog(null);
        setBrPop(false);
        setSetPop(false);
        return;
      }
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'j' || e.key === 'ArrowDown' || e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const ids = laned.map((c) => c.id);
        if (!ids.length) return;
        let i = selected ? ids.indexOf(selected) : -1;
        i = e.key === 'j' || e.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1);
        selectCommit(ids[i]!);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected, laned, selectCommit, closeDrawer]);

  // ---- build detail (the diff panel is permanent — working diff is the default) ----
  type Detail =
    | { kind: 'commit'; commit: LanedCommit; groups: DiffGroup[] }
    | { kind: 'wd'; groups: DiffGroup[] }
    | { kind: 'peek'; wt: Worktree; groups: DiffGroup[] }
    | { kind: 'empty' };
  const wdGroups = (): DiffGroup[] => {
    const d = workingDiffQ.data;
    if (!d) return [];
    if (peekObj) {
      return [
        d.staged.length ? { label: 'Staged', files: d.staged, staged: true } : null,
        d.unstaged.length ? { label: 'Changes', files: d.unstaged, staged: false } : null,
        d.untracked.length ? { label: 'Untracked', files: d.untracked, staged: false } : null,
      ].filter(Boolean) as DiffGroup[];
    }
    // preview grouping for the current worktree — reflects what would be
    // staged on commit, not git's actual index (see `excluded` above)
    const excludedFiles = [...d.staged, ...d.unstaged, ...d.untracked].filter((f) => excluded.has(f.path));
    return [
      previewIncluded.length ? { label: 'Staged', files: previewIncluded, staged: true } : null,
      excludedFiles.length ? { label: 'Excluded', files: excludedFiles, staged: false } : null,
    ].filter(Boolean) as DiffGroup[];
  };
  const selectedCommit = selectedSha ? lanedById.get(selectedSha) : undefined;
  let detail: Detail;
  if (peekObj) {
    detail = { kind: 'peek', wt: peekObj, groups: wdGroups() };
  } else if (selectedCommit) {
    const files = commitDiffQ.data?.sha === selectedCommit.id ? commitDiffQ.data.files : [];
    detail = { kind: 'commit', commit: selectedCommit, groups: [{ label: null, files, staged: false }] };
  } else if (selected === '__wd__' && hasUncommitted) {
    detail = { kind: 'wd', groups: wdGroups() };
  } else {
    detail = { kind: 'empty' };
  }
  const drawerOpen = detail.kind !== 'empty';

  // ---- menus ----
  const buildCommitActions = (c: LanedCommit): MenuAction[] => [
    { label: 'Create branch here', do: () => openCreate('branch', c.id) },
    { label: 'Create tag here', do: () => openCreate('tag', c.id) },
    { sep: true },
    ...(c.id === repo?.head
      ? [{ label: 'Uncommit — keep changes staged', do: () => actions.uncommit.mutate() }, { sep: true } as MenuAction]
      : []),
    { label: `Cherry-pick onto ${currentLabel.split('/').pop()}`, disabled: true, hint: 'M2' },
    { label: 'Revert commit', disabled: true, hint: 'M2' },
    { sep: true },
    {
      label: 'Copy SHA',
      do: () => {
        navigator.clipboard?.writeText(c.id).catch(() => {});
        flash('Copied ' + c.shortHash);
      },
    },
  ];

  const buildBranchActions = (ref: ViewRef): MenuAction[] => {
    const isCurrent = ref.name === currentBranch;
    const cur = (currentBranch ?? 'HEAD').split('/').pop();
    const out: MenuAction[] = [];
    if (ref.type === 'remote') {
      // bare branch name: git checks out the local branch or DWIM-creates a tracking one
      const base = ref.name.replace(/^[^/]+\//, '');
      const remoteName = ref.name.split('/')[0]!;
      out.push({ label: `Checkout '${base}'`, do: () => onCheckout(base) });
      out.push({ sep: true });
      out.push({ label: `Merge into '${cur}'`, disabled: true, hint: 'M2' });
      out.push({ label: `Fetch '${remoteName}'`, do: () => actions.fetchRemote.mutate({ remote: remoteName }) });
      return out;
    }
    if (isCurrent) {
      out.push({ label: '✓ current branch', disabled: true });
      out.push({ sep: true });
      out.push({ label: `Push '${ref.name}'`, do: () => actions.push.mutate({ ref: ref.name }) });
      out.push({ label: 'New branch from here…', do: () => openCreate('branch', tipOf(ref.name)) });
      out.push({ label: 'New tag here…', do: () => openCreate('tag', tipOf(ref.name)) });
      return out;
    }
    out.push({ label: `Checkout '${ref.name}'`, do: () => onCheckout(ref.name) });
    out.push({ sep: true });
    out.push({ label: `Merge into '${cur}'`, disabled: true, hint: 'M2' });
    out.push({ label: `Rebase '${cur}' onto this`, disabled: true, hint: 'M2' });
    out.push({ label: `Push '${ref.name}'`, do: () => actions.push.mutate({ ref: ref.name }) });
    out.push({ sep: true });
    out.push({ label: 'New branch from here…', do: () => openCreate('branch', tipOf(ref.name)) });
    out.push({ label: `Delete '${ref.name}'`, danger: true, disabled: true, hint: 'M2' });
    return out;
  };

  const filteredRefs = React.useMemo(() => {
    const bq = brQuery.trim().toLowerCase();
    const fb = (arr: GitRef[]) => (bq ? arr.filter((b) => b.name.toLowerCase().includes(bq)) : arr);
    return { locals: fb(refs.local), remotes: fb(refs.remote), tagList: fb(refs.tags) };
  }, [refs, brQuery]);

  const filteredStashes = React.useMemo(() => {
    const bq = brQuery.trim().toLowerCase();
    if (!bq) return stashes;
    return stashes.filter((s) => s.message.toLowerCase().includes(bq) || (s.branch ?? '').toLowerCase().includes(bq));
  }, [stashes, brQuery]);

  const filteredWorktrees = React.useMemo(() => {
    const bq = brQuery.trim().toLowerCase();
    if (!bq) return worktrees;
    return worktrees.filter(
      (w) => w.name.toLowerCase().includes(bq) || (w.branch ?? '').toLowerCase().includes(bq) || w.path.toLowerCase().includes(bq),
    );
  }, [worktrees, brQuery]);
  const showWorktrees = worktrees.length > 1;

  // bad path in the URL — offer the way home
  if (repoQ.isError) {
    return (
      <div className="v3">
        <div className="v3-top">
          <div className="v3-brand" style={{ cursor: 'pointer' }} onClick={navigateHome}>
            <span className="mark" /> progit
          </div>
        </div>
        <div className="detail-empty" style={{ flex: 1 }}>
          <div>
            <div className="big">⚠</div>
            <div style={{ marginBottom: 14, color: 'var(--tx-mid)' }}>{(repoQ.error as Error).message}</div>
            <div className="mono" style={{ marginBottom: 18, color: 'var(--tx-lo)', fontSize: 13 }}>{repoPath}</div>
            <button className="tb-btn" onClick={navigateHome}>← Back to repositories</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="v3">
      {/* ---------- floating top bar ---------- */}
      <div className="v3-top">
        <div className="v3-brand" style={{ cursor: 'pointer' }} onClick={navigateHome} title="All repositories">
          <span className="mark" /> progit
        </div>
        <div className="wt-switch" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
          <button className="tb-btn" onClick={() => setBrPop((v) => !v)}>
            <Icon name="folder" size={13} style={{ opacity: 0.6 }} /> <b style={{ color: 'var(--tx-hi)', fontWeight: 600 }}>{repo?.name ?? '…'}</b>
            <span style={{ width: 1, height: 12, background: 'var(--line)', margin: '0 2px' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: currentColor, display: 'inline-block' }} />
            {currentLabel}
            {peekObj && (
              <span className="peek-tag">
                <Icon name="eye" size={11} /> {peekObj.name}
              </span>
            )}
            <Icon name="chevron" size={12} style={{ opacity: 0.6 }} />
          </button>
          <Pop
            open={brPop}
            onClose={() => {
              setBrPop(false);
              setBrQuery('');
              setHoverBranch(null);
            }}
            style={{ left: 0, top: 40, width: 340 }}
          >
            <div className="pop-head">
              <span>Branches &amp; refs</span>
              <button
                className="pop-add"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreate('branch', focusTipId);
                }}
              >
                <Icon name="plus" size={12} /> New
              </button>
            </div>
            <div className="pop-search">
              <input
                autoFocus
                placeholder={showWorktrees ? 'Filter branches, tags, worktrees…' : 'Filter branches, tags…'}
                value={brQuery}
                onChange={(e) => setBrQuery(e.target.value)}
              />
            </div>
            <div className="pop-scroll">
              {filteredRefs.locals.length > 0 && <div className="pop-sec">Local</div>}
              {filteredRefs.locals.map((b) => (
                <div
                  key={b.name}
                  className={'pop-row' + (b.name === currentBranch ? ' current' : '')}
                  onClick={() => onCheckout(b.name)}
                  onMouseEnter={() => setHoverBranch(b.name)}
                  onMouseLeave={() => setHoverBranch(null)}
                >
                  <span className="sw" style={{ background: branchColor(b.name) }} />
                  <span className="nm">{b.name}</span>
                  <span className="meta">
                    {b.name === currentBranch && <span style={{ color: 'var(--accent)', fontSize: 12 }}>★</span>}
                    {b.upstream && !b.upstreamGone && (
                      <span className="ab">
                        <span className="up">↑{b.ahead ?? 0}</span>
                        <span className="dn">↓{b.behind ?? 0}</span>
                      </span>
                    )}
                    {b.upstreamGone && <span className="sub">gone</span>}
                  </span>
                </div>
              ))}
              {filteredRefs.remotes.length > 0 && <div className="pop-sec">Remote</div>}
              {filteredRefs.remotes.map((b) => (
                <div
                  key={b.name}
                  className="pop-row"
                  onClick={() => onCheckout(b.name.replace(/^[^/]+\//, ''))}
                  onMouseEnter={() => setHoverBranch(b.name)}
                  onMouseLeave={() => setHoverBranch(null)}
                >
                  <Icon name="remote" size={12} style={{ color: branchColor(b.name), opacity: 0.8 }} />
                  <span className="nm">{b.name}</span>
                </div>
              ))}
              {filteredRefs.tagList.length > 0 && <div className="pop-sec">Tags</div>}
              {filteredRefs.tagList.map((tg) => (
                <div
                  key={tg.name}
                  className="pop-row"
                  onClick={() => {
                    if (tg.tip && lanedById.has(tg.tip)) selectCommit(tg.tip);
                    setBrPop(false);
                  }}
                >
                  <Icon name="tag" size={12} style={{ color: 'var(--yellow)' }} />
                  <span className="nm">{tg.name}</span>
                  <span className="meta">
                    <span className="sub">{tg.updated ? shortDate(tg.updated) : ''}</span>
                  </span>
                </div>
              ))}
              {filteredStashes.length > 0 && <div className="pop-sec">Stashes</div>}
              {filteredStashes.map((s) => (
                <div key={s.ref} className="pop-row" onClick={() => onPopStash(s)} title="Pop stash — apply and remove">
                  <Icon name="stash" size={13} style={{ color: 'var(--tx-mid)', opacity: 0.85, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{stashLabel(s)}</div>
                    <div className="sub">
                      {s.branch ? `on ${s.branch}` : s.ref} · {shortDate(s.date)}
                    </div>
                  </div>
                  <span className="meta">
                    <button
                      className="stash-drop"
                      title="Drop stash — discard without applying"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDropStash(s);
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </span>
                </div>
              ))}
              {showWorktrees && filteredWorktrees.length > 0 && <div className="pop-sec">Worktrees</div>}
              {showWorktrees &&
                filteredWorktrees.map((w) => (
                  <div
                    key={w.path}
                    className={'pop-row' + ((peekObj ? peekObj.path === w.path : w.current) ? ' current' : '')}
                    onClick={() => onPeekWt(w)}
                  >
                    <Icon name="worktree" size={14} style={{ color: branchColor(w.branch ?? w.name) }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="nm">
                        {w.name}
                        {w.current && <span className="sub"> · current</span>}
                      </div>
                      <div className="sub">{w.path}</div>
                    </div>
                    <div className="meta" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span className="sub">{w.branch ?? w.head.slice(0, 8)}</span>
                      <span className={w.dirty ? 'badge-dirty' : 'badge-clean'}>{w.dirty ? `${w.dirty} dirty` : 'clean'}</span>
                    </div>
                  </div>
                ))}
              {filteredRefs.locals.length +
                filteredRefs.remotes.length +
                filteredRefs.tagList.length +
                filteredStashes.length +
                (showWorktrees ? filteredWorktrees.length : 0) ===
                0 && <div style={{ padding: '14px 12px', fontSize: 13, color: 'var(--tx-lo)', textAlign: 'center' }}>No matches</div>}
            </div>
            <div className="pop-foot">
              <button className="pop-fbtn" onClick={() => openCreate('branch', focusTipId)}>
                <Icon name="branch" size={12} /> New branch…
              </button>
              <button className="pop-fbtn" onClick={() => openCreate('tag', focusTipId)}>
                <Icon name="tag" size={12} /> New tag…
              </button>
            </div>
          </Pop>
        </div>

        <div style={{ flex: 1 }} />

        <div className="v3-actions">
          <button
            className="tb-btn"
            disabled={actions.fetchRemote.isPending}
            style={{ opacity: actions.fetchRemote.isPending ? 0.45 : 1 }}
            onClick={() => actions.fetchRemote.mutate({})}
          >
            <Icon name="fetch" size={13} /> {actions.fetchRemote.isPending ? 'Fetching…' : 'Fetch'}
          </button>
          {status && status.behind > 0 && (
            <button
              className="tb-btn"
              disabled={actions.pull.isPending}
              style={{ opacity: actions.pull.isPending ? 0.45 : 1 }}
              onClick={() => actions.pull.mutate()}
            >
              <Icon name="pull" size={13} /> {actions.pull.isPending ? 'Pulling…' : 'Pull'} <span className="cnt">↓{status.behind}</span>
            </button>
          )}
          <button
            className="tb-btn primary"
            disabled={actions.push.isPending || !currentBranch || nothingToPush}
            title={
              !currentBranch
                ? 'Detached HEAD — check out a branch to push'
                : nothingToPush
                  ? 'Nothing to push — branch is up to date with its upstream'
                  : undefined
            }
            style={{ opacity: actions.push.isPending || !currentBranch || nothingToPush ? 0.45 : 1 }}
            onClick={() => actions.push.mutate({})}
          >
            <Icon name="push" size={13} /> {actions.push.isPending ? 'Pushing…' : 'Push'}{' '}
            {status && status.ahead > 0 && <span className="cnt">↑{status.ahead}</span>}
          </button>
          <button
            className="tb-btn"
            onClick={() => setSetting('theme', settings.theme === 'dark' ? 'light' : 'dark')}
            title={settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            <Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} size={14} />
          </button>
          <div className="wt-switch" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
            <button
              className="tb-btn"
              onClick={() => setSetPop((v) => !v)}
              title="Settings"
              aria-haspopup="dialog"
              aria-expanded={setPop}
            >
              <Icon name="gear" size={13} />
            </button>
            <Pop open={setPop} onClose={() => setSetPop(false)} style={{ right: 0, top: 40, width: 260 }}>
              <div className="pop-head">
                <span>Settings</span>
              </div>
              <div style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tx)' }}>Diff mode</span>
                  <div className="seg">
                    <button className={settings.diffMode === 'inline' ? 'on' : ''} onClick={() => setSetting('diffMode', 'inline')}>
                      Inline
                    </button>
                    <button className={settings.diffMode === 'split' ? 'on' : ''} onClick={() => setSetting('diffMode', 'split')}>
                      Split
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tx)' }}>Collapse long lanes</span>
                  <label className="chk" onClick={() => setSetting('collapse', !settings.collapse)} style={{ margin: 0 }}>
                    <span className={'cbx' + (settings.collapse ? ' on' : '')}>{settings.collapse && <Icon name="check" size={11} />}</span>
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tx)' }}>Appearance</span>
                  <div className="seg">
                    <button className={settings.theme === 'light' ? 'on' : ''} onClick={() => setSetting('theme', 'light')}>
                      <Icon name="sun" size={13} /> Light
                    </button>
                    <button className={settings.theme === 'dark' ? 'on' : ''} onClick={() => setSetting('theme', 'dark')}>
                      <Icon name="moon" size={13} /> Dark
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tx)' }}>Accent</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Object.keys(ACCENTS).map((a) => (
                      <span
                        key={a}
                        onClick={() => setSetting('accent', a)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: ACCENTS[a]!.swatch,
                          cursor: 'pointer',
                          boxShadow: settings.accent === a ? '0 0 0 2px var(--bg-1), 0 0 0 4px ' + ACCENTS[a]!.swatch : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Pop>
          </div>
        </div>
      </div>

      {/* ---------- tree stage + permanent diff panel ---------- */}
      <div className="v3-stage">
        <div className="stage-tree">
          <TreeGraph
            commits={laned}
            selected={selected}
            onSelect={selectCommit}
            hiliteSet={ancestry}
            hiliteLane={ancestry ? activeLane : null}
            collapseFocus={settings.collapse}
            focusTipId={focusTipId}
            wdParentId={focusTipId}
            onContext={(e, c) => {
              setBranchMenu(null);
              setCtx({ x: e.clientX, y: e.clientY, c });
            }}
            onBranchMenu={(e, r) => {
              setCtx(null);
              setBranchMenu({ x: e.clientX, y: e.clientY, ref: r });
            }}
            hasUncommitted={hasUncommitted}
            wdCount={wdCount}
            wdFiles={wdFiles}
            onSelectFile={selectWdFile}
            activeFilePath={wdFocus?.path ?? null}
            hasMore={logQ.data?.hasMore ?? false}
            loadingMore={logQ.isFetching}
            onLoadMore={loadMore}
          />

          {laned.length === 0 && !logQ.isLoading && (
            <div className="detail-empty" style={{ position: 'absolute', inset: 0 }}>
              <div>
                <div className="big">∅</div>
                No commits yet{hasUncommitted ? ' — stage and commit your changes via the working tree row' : ''}
              </div>
            </div>
          )}
        </div>

        {/* ---------- diff panel ---------- */}
        <div className={'diff-panel' + (drawerOpen ? ' open' : '')} style={{ width: drawerW || undefined }}>
          <div className={'drawer-resize' + (resizing ? ' dragging' : '')} onMouseDown={startResize} />
          {drawerOpen && (
            <button className="drawer-close" onClick={closeDrawer}>
              ✕
            </button>
          )}
          {detail.kind === 'commit' && (
              <div className="detail-head">
                <div className="dh-top">
                  <span className="dh-avatar" style={{ background: avatarColor(detail.commit.email) }}>
                    {initials(detail.commit.author)}
                  </span>
                  <span className="dh-msg">{detail.commit.msg}</span>
                  <span className="dh-hash mono">{detail.commit.shortHash}</span>
                </div>
                <div className="dh-sub">
                  <span>{detail.commit.author}</span>
                  <span style={{ color: 'var(--tx-lo)' }}>·</span>
                  <span className="mono">{shortDate(detail.commit.date)}</span>
                  {detail.commit.refs.map((r) => (
                    <RefMini key={r.type + r.name} r={r} />
                  ))}
                </div>
              </div>
            )}
            {detail.kind === 'wd' && (
              <div className="detail-head">
                <div className="dh-top">
                  <span className="dh-avatar" style={{ background: 'var(--orange)', color: 'oklch(0.2 0.02 65)' }}>
                    <Icon name="diff" size={13} />
                  </span>
                  <span className="dh-msg">Working tree</span>
                </div>
                <div className="dh-sub">
                  <span className="mono">{repo?.name}</span>
                  <span style={{ color: 'var(--tx-lo)' }}>·</span>
                  <span>
                    uncommitted on <b style={{ color: 'var(--tx)' }}>{currentLabel}</b>
                  </span>
                </div>
                <div className="commit-form">
                  <input
                    className="tin"
                    placeholder={
                      amend
                        ? 'New title (empty keeps the previous message)…'
                        : stagedCount
                          ? `Title — committing ${stagedCount} staged file${stagedCount === 1 ? '' : 's'}…`
                          : 'Title — check files below to stage them…'
                    }
                    value={commitTitle}
                    onChange={(e) => setCommitTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') doCommit();
                    }}
                  />
                  {/* <textarea
                    className="tin"
                    rows={3}
                    placeholder="Description (optional)…"
                    value={commitBody}
                    onChange={(e) => setCommitBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doCommit();
                    }}
                  /> */}
                  <div className="cf-row">
                    <label className="chk" style={{ margin: 0 }} onClick={() => setAmend((v) => !v)}>
                      <span className={'cbx sm' + (amend ? ' on' : '')}>{amend && <Icon name="check" size={10} />}</span>
                      Append to last commit
                    </label>
                    <span style={{ flex: 1 }} />
                    <button
                      className="tb-btn"
                      disabled={actions.stashPush.isPending}
                      style={{ opacity: actions.stashPush.isPending ? 0.45 : 1, height: 32 }}
                      title="Stash all uncommitted changes (including untracked) — uses the title above as its label"
                      onClick={doStash}
                    >
                      <Icon name="stash" size={13} /> Stash
                    </button>
                    <button
                      className="tb-btn primary"
                      disabled={!canCommit}
                      style={{ opacity: canCommit ? 1 : 0.45, height: 32 }}
                      onClick={doCommit}
                    >
                      <Icon name="check" size={13} /> {amend ? 'Amend' : 'Commit'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {detail.kind === 'peek' && (
              <div className="detail-head peek">
                <div className="dh-top">
                  <span className="dh-avatar" style={{ background: branchColor(detail.wt.branch ?? detail.wt.name), color: 'oklch(0.2 0.02 150)' }}>
                    <Icon name="worktree" size={13} />
                  </span>
                  <span className="dh-msg">{detail.wt.name}</span>
                  <span className="peek-tag">
                    <Icon name="eye" size={11} /> peeking
                  </span>
                </div>
                <div className="dh-sub">
                  <span className="mono" style={{ color: 'var(--tx-mid)' }}>
                    {detail.wt.path}
                  </span>
                  <span style={{ color: 'var(--tx-lo)' }}>·</span>
                  <span>
                    on <b style={{ color: 'var(--tx)' }}>{detail.wt.branch ?? detail.wt.head.slice(0, 8)}</b>
                  </span>
                </div>
              </div>
            )}
          {detail.kind === 'empty' ? (
            <div className="detail-empty">
              <div>
                <div className="big">∅</div>
                No uncommitted changes
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--tx-lo)' }}>Select a commit to view its diff</div>
              </div>
            </div>
          ) : (
            <DiffViewer
              key={detail.kind === 'commit' ? detail.commit.id : detail.kind === 'peek' ? 'peek:' + detail.wt.path : '__wd__'}
              groups={detail.groups}
              mode={settings.diffMode}
              staging={detail.kind === 'wd'}
              onStage={detail.kind === 'wd' ? onStage : undefined}
              onStageAll={detail.kind === 'wd' ? onStageAll : undefined}
              focusPath={detail.kind === 'wd' ? wdFocus?.path ?? null : null}
              focusNonce={wdFocus?.n ?? 0}
            />
          )}
        </div>
      </div>

      {/* ---------- commit context menu ---------- */}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          header={
            <div style={{ padding: '4px 9px 6px', fontSize: 12, color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>
              {ctx.c.shortHash} · {ctx.c.author}
            </div>
          }
          actions={buildCommitActions(ctx.c)}
        />
      )}

      {/* ---------- branch pill menu ---------- */}
      {branchMenu && (
        <ContextMenu
          x={branchMenu.x}
          y={branchMenu.y}
          width={230}
          onClose={() => setBranchMenu(null)}
          header={
            <div
              style={{
                padding: '5px 9px 7px',
                fontSize: 12.5,
                color: 'var(--tx-hi)',
                fontFamily: 'var(--mono)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                borderBottom: '1px solid var(--line-soft)',
                marginBottom: 3,
              }}
            >
              {branchMenu.ref.type === 'remote' ? (
                <Icon name="remote" size={11} style={{ color: branchMenu.ref.color || 'var(--tx-mid)' }} />
              ) : (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: branchMenu.ref.color || 'var(--accent)' }} />
              )}
              {branchMenu.ref.name}
            </div>
          }
          actions={buildBranchActions(branchMenu.ref)}
        />
      )}

      {toast && (
        <div
          className="fade-in"
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 300,
            background: 'var(--bg-2)',
            border: '1px solid ' + (toast.error ? 'var(--red)' : 'var(--line)'),
            borderRadius: 8,
            padding: '8px 14px',
            color: toast.error ? 'var(--red)' : 'var(--tx-hi)',
            boxShadow: 'var(--shadow)',
            fontSize: 13.5,
            maxWidth: 560,
            whiteSpace: 'pre-wrap',
          }}
        >
          {toast.msg}
        </div>
      )}

      {credReq && <CredentialDialog prompt={credReq.prompt} onSubmit={answerCredential} onCancel={() => answerCredential('')} />}

      {dialog && (
        <CreateRefDialog
          kind={dialog.kind}
          base={dialog.baseId ? lanedById.get(dialog.baseId) ?? null : null}
          nextColor={LANE_PALETTE[(refs.local.length + 1) % LANE_PALETTE.length]!}
          existingNames={dialog.kind === 'branch' ? [...refs.local, ...refs.remote].map((b) => b.name) : refs.tags.map((t) => t.name)}
          onCancel={() => setDialog(null)}
          onCreate={(name, checkout) => createRef(dialog.kind, dialog.baseId, name, checkout)}
        />
      )}
    </div>
  );
}
