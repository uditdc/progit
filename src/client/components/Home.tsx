/* Home — open a repository by path, or jump back into a recent one (ungit-style). */

import React from 'react';
import { api } from '../api/client';
import { getRecentRepos, navigateToRepo, pushRecentRepo, removeRecentRepo, type RecentRepo } from '../lib/router';
import { relativeTime } from '../lib/relative-time';
import { Icon } from './Icon';

export function Home() {
  const [path, setPath] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [recent, setRecent] = React.useState<RecentRepo[]>(getRecentRepos);
  const inp = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inp.current?.focus();
  }, []);

  const open = async (p: string) => {
    const trimmed = p.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const info = await api.repo(trimmed);
      pushRecentRepo(info.path, info.name);
      navigateToRepo(info.path);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v3">
      <div className="v3-top">
        <div className="v3-brand">
          <span className="mark" /> progit
          <span className="ver">M1 · tree</span>
        </div>
      </div>
      <div className="home-stage">
        <div className="home-card">
          <div className="home-title">Open a repository</div>
          <div className="home-sub">Absolute path to any git repository or worktree on this machine</div>
          <div className="home-open">
            <input
              ref={inp}
              className="tin mono"
              placeholder="/path/to/repository"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') open(path);
              }}
            />
            <button className="tb-btn primary" style={{ height: 36, opacity: path.trim() && !busy ? 1 : 0.45 }} onClick={() => open(path)}>
              <Icon name="folder" size={13} /> Open
            </button>
          </div>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

          {recent.length > 0 && (
            <>
              <div className="home-sec">Recent</div>
              <div className="home-recent">
                {recent.map((r) => (
                  <div key={r.path} className="pop-row" onClick={() => open(r.path)}>
                    <Icon name="folder" size={13} style={{ opacity: 0.6 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="nm">{r.name}</div>
                      <div className="sub mono">{r.path}</div>
                    </div>
                    <div className="meta">
                      <span className="sub">{relativeTime(new Date(r.at).toISOString())}</span>
                      <button
                        className="home-remove"
                        title="Remove from recent"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecentRepo(r.path);
                          setRecent(getRecentRepos());
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="home-hint">
            tip: run <span className="k mono">progit</span> inside a repository to open it directly
          </div>
        </div>
      </div>
    </div>
  );
}
