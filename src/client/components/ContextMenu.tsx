import React from 'react';

export interface MenuAction {
  label?: string;
  k?: string;
  sep?: boolean;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
  do?: () => void;
}

export function ContextMenu({
  x,
  y,
  header,
  actions,
  onClose,
  width = 210,
}: {
  x: number;
  y: number;
  header?: React.ReactNode;
  actions: MenuAction[];
  onClose: () => void;
  width?: number;
}) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="ctx-menu fade-in"
        style={{ left: Math.min(x, window.innerWidth - width - 10), top: Math.min(y, window.innerHeight - 40 - actions.length * 30) }}
      >
        {header}
        {actions.map((a, i) =>
          a.sep ? (
            <div key={i} className="sep" />
          ) : (
            <div
              key={i}
              className="mi"
              style={{
                opacity: a.disabled ? 0.45 : 1,
                color: a.danger ? 'var(--red)' : undefined,
                cursor: a.disabled ? 'default' : 'pointer',
              }}
              onClick={() => {
                if (a.disabled) return;
                a.do?.();
                onClose();
              }}
            >
              {a.label}
              {(a.k || a.hint) && <span className="k">{a.k ?? a.hint}</span>}
            </div>
          ),
        )}
      </div>
    </>
  );
}
