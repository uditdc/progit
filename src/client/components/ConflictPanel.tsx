/* Lists conflicted paths with their conflict kind. Visualization only — no
   resolve/accept-ours/accept-theirs actions here; those land with the
   merge/rebase/cherry-pick/revert UI that consumes this same conflict state. */

import type { ConflictKind, StatusFile } from '../../shared/types';

const KIND_LABEL: Record<ConflictKind, string> = {
  'both-modified': 'Both modified',
  'both-added': 'Both added',
  'both-deleted': 'Both deleted',
  'added-by-us': 'Added by us',
  'added-by-them': 'Added by them',
  'deleted-by-us': 'Deleted by us',
  'deleted-by-them': 'Deleted by them',
};

function splitPath(p: string): { dir: string; base: string } {
  const i = p.lastIndexOf('/');
  return i === -1 ? { dir: '', base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

export function ConflictPanel({ files }: { files: StatusFile[] }) {
  if (!files.length) return null;
  return (
    <div className="files conflict-panel">
      <div className="files-group-label conflict-label">
        Conflicts
        <span style={{ color: 'var(--tx-lo)' }}>· {files.length}</span>
      </div>
      {files.map((f) => {
        const { dir, base } = splitPath(f.path);
        return (
          <div key={f.path} className="file-row conflict-row">
            <span className="stico st-deleted">!</span>
            <span className="fpath">
              <span className="dir">{dir}</span>
              {base}
            </span>
            <span className="fmeta">
              <span className="conflict-kind">{KIND_LABEL[f.conflictKind ?? 'both-modified']}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
