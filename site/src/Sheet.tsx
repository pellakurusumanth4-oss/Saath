// A sheet that slides up from the bottom on a phone and sits centred on a desktop. Escape or a tap outside closes it.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function Sheet({ label, onClose, children, className = '', grabber = true }: {
  label: string; onClose: () => void; children: ReactNode; className?: string; grabber?: boolean;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => box.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="j-back" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} className={`j-sheet ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        {grabber && <div className="grabber" />}
        {children}
      </div>
    </div>,
    document.body,
  );
}
