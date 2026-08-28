import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChangeEvent, CredentialRequestEvent } from '../../shared/types';

export type ConnectionState = 'connected' | 'reconnecting';

/** Subscribes to the repo's SSE feed: change events invalidate queries,
    credential events surface the askpass modal. Returns the live-connection
    state so callers can surface a disconnect/reconnecting indicator — the
    browser retries a dropped EventSource on its own, so 'reconnecting' just
    tracks the gap between an 'error' and the next 'open'. */
export function useLiveUpdates(path: string, onCredential?: (e: CredentialRequestEvent) => void): ConnectionState {
  const qc = useQueryClient();
  const credRef = React.useRef(onCredential);
  credRef.current = onCredential;
  const [connection, setConnection] = React.useState<ConnectionState>('connected');
  React.useEffect(() => {
    setConnection('connected');
    const es = new EventSource('/api/events?path=' + encodeURIComponent(path));
    es.addEventListener('open', () => setConnection('connected'));
    es.addEventListener('error', () => setConnection('reconnecting'));
    es.addEventListener('credential', (e) => {
      try {
        credRef.current?.(JSON.parse((e as MessageEvent).data) as CredentialRequestEvent);
      } catch {
        /* malformed event — nothing to prompt with */
      }
    });
    es.addEventListener('change', (e) => {
      let scope: ChangeEvent['scope'] = 'all';
      try {
        scope = (JSON.parse((e as MessageEvent).data) as ChangeEvent).scope;
      } catch {
        /* malformed event — refresh everything */
      }
      // any change can add, remove, or renumber stashes
      qc.invalidateQueries({ queryKey: ['stashes', path] });
      if (scope === 'refs' || scope === 'all') {
        qc.invalidateQueries({ queryKey: ['log', path] });
        qc.invalidateQueries({ queryKey: ['refs', path] });
        qc.invalidateQueries({ queryKey: ['repo', path] });
      }
      if (scope === 'index' || scope === 'worktree' || scope === 'all') {
        qc.invalidateQueries({ queryKey: ['status', path] });
        qc.invalidateQueries({ queryKey: ['worktrees', path] });
        qc.invalidateQueries({ queryKey: ['diff', path, 'working'] });
      }
    });
    return () => es.close();
  }, [qc, path]);
  return connection;
}
