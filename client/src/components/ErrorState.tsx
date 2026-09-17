import type { ReactNode } from 'react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}

/**
 * Inline API-failure banner with a plain-language message and Retry action (ui-spec.md §3 "Error").
 * Form screens pass preserved field values as `children` alongside this banner (BR-17, AC-09).
 */
export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
  retryLabel = 'Retry',
  children,
}: ErrorStateProps) {
  return (
    <div className="zg-error-banner" role="alert">
      <div>{message}</div>
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
