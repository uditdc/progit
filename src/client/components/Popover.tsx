import React from 'react';
import { useFocusTrap } from '../lib/a11y';

export function Pop({
  open,
  onClose,
  children,
  style,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const popRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(popRef, open, onClose);
  React.useEffect(() => {
    if (!open) return;
    const h = () => onClose();
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={popRef} className="pop" role="dialog" style={style} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
