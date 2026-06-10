import type { GitRef, RefsPayload } from '../../shared/types.js';

export const REFS_FORMAT =
  '%(refname)%1f%(objectname)%1f%(*objectname)%1f%(upstream:short)%1f%(upstream:track)%1f%(committerdate:iso-strict)%1f%(HEAD)';

function parseTrack(track: string): { ahead?: number; behind?: number; gone?: boolean } {
  if (!track) return {};
  if (track === '[gone]') return { gone: true };
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  return {
    ahead: ahead ? Number(ahead[1]) : 0,
    behind: behind ? Number(behind[1]) : 0,
  };
}

export function parseRefs(out: string): RefsPayload {
  const payload: RefsPayload = { local: [], remote: [], tags: [] };
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const f = line.split('\x1f');
    if (f.length < 7) continue;
    const [refname, sha, peeled, upstream, track, date, head] = f as [string, string, string, string, string, string, string];
    const tip = peeled || sha;
    if (refname.startsWith('refs/heads/')) {
      const t = parseTrack(track);
      const ref: GitRef = {
        name: refname.slice('refs/heads/'.length),
        type: 'local',
        tip,
        updated: date,
      };
      if (head === '*') ref.current = true;
      if (upstream) ref.upstream = upstream;
      if (t.gone) ref.upstreamGone = true;
      if (t.ahead !== undefined) ref.ahead = t.ahead;
      if (t.behind !== undefined) ref.behind = t.behind;
      payload.local.push(ref);
    } else if (refname.startsWith('refs/remotes/')) {
      const name = refname.slice('refs/remotes/'.length);
      if (name.endsWith('/HEAD')) continue;
      payload.remote.push({ name, type: 'remote', tip, updated: date });
    } else if (refname.startsWith('refs/tags/')) {
      payload.tags.push({ name: refname.slice('refs/tags/'.length), type: 'tag', tip, updated: date });
    }
  }
  return payload;
}
