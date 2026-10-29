import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  /** Element to focus when the modal opens; defaults to the dialog itself. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Minimal centered overlay modal (ui-spec.md §5.7 "Create/Edit User Drawer / Modal").
 * Lab 4 (docs/lab-04/ui-spec.md §10): traps focus, closes with Esc, and returns focus to its trigger.
 */
export function Modal({ title, onClose, children, maxWidth = 520, initialFocusRef }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose, initialFocusRef);

  return (
    <div
      ref={dialogRef}
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{ background: 'rgba(0, 0, 0, 0.4)', zIndex: 1050, overflowY: 'auto' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className="card border-0 shadow-lg w-100 my-4" style={{ maxWidth }}>
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 id={titleId} className="h5 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
              {title}
            </h2>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;
