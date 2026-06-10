import React from 'react';
import type { LanedCommit } from '../graph/lanes';
import { REF_NAME_RE } from '../../shared/types';
import { Icon } from './Icon';

export function CreateRefDialog({
  kind,
  base,
  nextColor,
  existingNames,
  onCancel,
  onCreate,
}: {
  kind: 'branch' | 'tag';
  base: LanedCommit | null;
  nextColor: string;
  existingNames: string[];
  onCancel: () => void;
  onCreate: (name: string, checkout: boolean) => void;
}) {
  const [name, setName] = React.useState('');
  const [checkout, setCheckout] = React.useState(true);
  const inp = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const id = setTimeout(() => inp.current?.focus(), 30);
    return () => clearTimeout(id);
  }, []);
  const trimmed = name.trim();
  const isBranch = kind === 'branch';
  const dup = existingNames.includes(trimmed);
  const bad = trimmed.length > 0 && !REF_NAME_RE.test(trimmed);
  const valid = trimmed.length > 0 && !dup && !bad;
  const submit = () => {
    if (valid) onCreate(trimmed, checkout);
  };
  return (
    <div className="modal-scrim" onMouseDown={onCancel}>
      <div className="modal fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {isBranch ? (
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: nextColor }} />
          ) : (
            <Icon name="tag" size={14} style={{ color: 'var(--yellow)' }} />
          )}
          New {isBranch ? 'branch' : 'tag'}
        </div>
        <div className="modal-body">
          <label className="fld">
            {isBranch ? 'Branch' : 'Tag'} name
            <input
              ref={inp}
              className="tin"
              value={name}
              placeholder={isBranch ? 'feature/my-thing' : 'v1.0.0'}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onCancel();
              }}
            />
          </label>
          {dup && <div className="err">A {isBranch ? 'branch' : 'tag'} named “{trimmed}” already exists.</div>}
          {bad && <div className="err">Use letters, numbers, and . _ / -</div>}
          <div className="modal-base">
            <Icon name="branch" size={12} style={{ opacity: 0.6 }} />
            <span>based on</span>
            <b style={{ color: base ? base.color : 'var(--tx)' }} className="mono">
              {base ? base.shortHash : 'HEAD'}
            </b>
            <span className="bmsg">{base ? base.msg : ''}</span>
          </div>
        </div>
        <div className="modal-foot">
          {isBranch && (
            <label className="chk" onClick={() => setCheckout((v) => !v)}>
              <span className={'cbx' + (checkout ? ' on' : '')}>{checkout && <Icon name="check" size={11} />}</span>
              Check out after creating
            </label>
          )}
          <button className="tb-btn" onMouseDown={onCancel}>
            Cancel
          </button>
          <button
            className="tb-btn primary"
            disabled={!valid}
            style={{ opacity: valid ? 1 : 0.45, cursor: valid ? 'pointer' : 'not-allowed' }}
            onClick={submit}
          >
            <Icon name="plus" size={12} /> Create {isBranch ? 'branch' : 'tag'}
          </button>
        </div>
      </div>
    </div>
  );
}
