import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}

/** Minimal centered overlay modal (ui-spec.md §5.7 "Create/Edit User Drawer / Modal"). */
export function Modal({ title, onClose, children, maxWidth = 520 }: ModalProps) {
  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
      style={{ background: 'rgba(0, 0, 0, 0.4)', zIndex: 1050, overflowY: 'auto' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="card border-0 shadow-lg w-100 my-4" style={{ maxWidth }}>
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h5 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
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
