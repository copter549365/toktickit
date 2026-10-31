import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type ErrorVariant = 'failure' | 'forbidden' | 'notFound';

interface ErrorStateProps {
  /** docs/lab-04/ui-spec.md §8: one wording per state across the product (spec D-19). */
  variant?: ErrorVariant;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** failure: preserved field values; notFound: the way back (e.g. "Back to Queue"). */
  children?: ReactNode;
}

const PANEL: Record<Exclude<ErrorVariant, 'failure'>, { icon: string; message: string; testId: string }> = {
  forbidden: { icon: '🔒', message: "You don't have access to this page.", testId: 'forbidden-state' },
  notFound: { icon: '🚫', message: "This ticket doesn't exist or you can't view it.", testId: 'not-found-state' },
};

/**
 * Shared error feedback (ui-spec §8):
 * - `failure` (default): an inline banner with a plain-language message and Retry. Form screens
 *   pass preserved field values as `children` (BR-17, AC-09). Raw error text is never shown.
 * - `forbidden`: a panel with a link to the Dashboard.
 * - `notFound`: a panel; the screen passes its own way back as `children`.
 */
export function ErrorState({
  variant = 'failure',
  message,
  onRetry,
  retryLabel = 'Retry',
  children,
}: ErrorStateProps) {
  if (variant !== 'failure') {
    const panel = PANEL[variant];
    return (
      <div className="zg-state-panel" role="alert" data-testid={panel.testId}>
        <div className="zg-state-panel__icon" aria-hidden="true">
          {panel.icon}
        </div>
        <div className="zg-state-panel__message">{message ?? panel.message}</div>
        {variant === 'forbidden' ? (
          <Link to="/dashboard" className="btn btn-zg-primary">
            Go to Dashboard
          </Link>
        ) : (
          children
        )}
      </div>
    );
  }

  return (
    <div className="zg-error-banner" role="alert">
      <div>{message ?? 'Something went wrong. Please try again.'}</div>
      {onRetry && (
        <button type="button" className="btn btn-zg-secondary mt-2" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
      {children}
    </div>
  );
}

export default ErrorState;
