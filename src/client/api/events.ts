import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChangeEvent } from '../../shared/types';

/** Subscribes to the server's SSE change feed and invalidates affected queries. */
export function useLiveUpdates() {
  const qc = useQueryClient();
  React.useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('change', (e) => {
      let scope: ChangeEvent['scope'] = 'all';
      try {
        scope = (JSON.parse((e as MessageEvent).data) as ChangeEvent).scope;
      } catch {
        /* malformed event — refresh everything */
      }
      if (scope === 'refs' || scope === 'all') {
        qc.invalidateQueries({ queryKey: ['log'] });
        qc.invalidateQueries({ queryKey: ['refs'] });
        qc.invalidateQueries({ queryKey: ['repo'] });
      }
      if (scope === 'index' || scope === 'worktree' || scope === 'all') {
        qc.invalidateQueries({ queryKey: ['status'] });
        qc.invalidateQueries({ queryKey: ['worktrees'] });
        qc.invalidateQueries({ queryKey: ['diff', 'working'] });
      }
    });
    return () => es.close();
  }, [qc]);
}
