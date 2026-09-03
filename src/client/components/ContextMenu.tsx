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
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const enabledIndices = React.useMemo(
    () => actions.map((a, i) => (a.sep || a.disabled ? -1 : i)).filter((i) => i >= 0),
    [actions],
  );
  const [activeIndex, setActiveIndex] = React.useState<number>(enabledIndices[0] ?? -1);

  React.useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    return () => {
      if (prevFocused && document.contains(prevFocused)) prevFocused.focus();
    };
  }, []);

  React.useEffect(() => {
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex]);

  const moveActive = (dir: 1 | -1) => {
    if (enabledIndices.length === 0) return;
    const pos = enabledIndices.indexOf(activeIndex);
    const next = pos === -1 ? 0 : (pos + dir + enabledIndices.length) % enabledIndices.length;
    setActiveIndex(enabledIndices[next]!);
  };

  const activate = (a: MenuAction) => {
    if (a.disabled) return;
    a.do?.();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        if (enabledIndices[0] !== undefined) setActiveIndex(enabledIndices[0]);
        break;
      case 'End':
        e.preventDefault();
        if (enabledIndices.length) setActiveIndex(enabledIndices[enabledIndices.length - 1]!);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) activate(actions[activeIndex]!);
        break;
      case 'Tab':
        e.preventDefault();
        onClose();
        break;
    }
  };

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
        role="menu"
        onKeyDown={onKeyDown}
        style={{ left: Math.min(x, window.innerWidth - width - 10), top: Math.min(y, window.innerHeight - 40 - actions.length * 30) }}
      >
        {header}
        {actions.map((a, i) =>
          a.sep ? (
            <div key={i} className="sep" role="separator" />
          ) : (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="mi"
              role="menuitem"
              tabIndex={i === activeIndex ? 0 : -1}
              aria-disabled={a.disabled || undefined}
              style={{
                opacity: a.disabled ? 0.45 : 1,
                color: a.danger ? 'var(--red)' : undefined,
                cursor: a.disabled ? 'default' : 'pointer',
              }}
              onMouseEnter={() => !a.disabled && setActiveIndex(i)}
              onClick={() => activate(a)}
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
