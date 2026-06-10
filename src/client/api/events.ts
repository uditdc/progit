import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChangeEvent, CredentialRequestEvent } from '../../shared/types';

/** Subscribes to the repo's SSE feed: change events invalidate queries,
    credential events surface the askpass modal. */
export function useLiveUpdates(path: string, onCredential?: (e: CredentialRequestEvent) => void) {
  const qc = useQueryClient();
  const credRef = React.useRef(onCredential);
  credRef.current = onCredential;
  React.useEffect(() => {
    const es = new EventSource('/api/events?path=' + encodeURIComponent(path));
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
}
