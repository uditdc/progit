import React from 'react';
import { Icon } from './Icon';

export function CredentialDialog({
  prompt,
  onSubmit,
  onCancel,
}: {
  prompt: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState('');
  const inp = React.useRef<HTMLInputElement>(null);
  const secret = /pass|token|secret/i.test(prompt);
  React.useEffect(() => {
    const id = setTimeout(() => inp.current?.focus(), 30);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="modal-scrim" onMouseDown={onCancel}>
      <div className="modal fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="remote" size={14} style={{ color: 'var(--accent)' }} />
          Git needs credentials
        </div>
        <div className="modal-body">
          <label className="fld">
            {prompt || 'Credential'}
            <input
              ref={inp}
              className="tin"
              type={secret ? 'password' : 'text'}
              value={value}
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit(value);
                if (e.key === 'Escape') onCancel();
              }}
            />
          </label>
          <div style={{ fontSize: 12, color: 'var(--tx-lo)' }}>
            Sent once to git for this operation — progit does not store credentials.
          </div>
        </div>
        <div className="modal-foot">
          <span style={{ marginRight: 'auto' }} />
          <button className="tb-btn" onMouseDown={onCancel}>
            Cancel
          </button>
          <button className="tb-btn primary" onClick={() => onSubmit(value)}>
            <Icon name="check" size={12} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
