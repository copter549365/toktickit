import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface DrawerProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Right-side drawer, full-screen sheet below 768px (docs/lab-04/ui-spec.md §5.4, §9). A focus-trapped
 * dialog labelled by its title; Esc closes it and focus returns to the trigger (§10).
 */
export function Drawer({ title, onClose, children, initialFocusRef }: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(panelRef, onClose, initialFocusRef);

  return (
    <div
      className="zg-drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="zg-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="zg-drawer__header d-flex justify-content-between align-items-center gap-2">
          <h2 id={titleId} className="h5 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
            {title}
          </h2>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>
        <div className="zg-drawer__body">{children}</div>
      </div>
    </div>
  );
}

export default Drawer;
