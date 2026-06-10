import React from 'react';

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
  React.useEffect(() => {
    if (!open) return;
    const h = () => onClose();
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="pop" style={style} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
