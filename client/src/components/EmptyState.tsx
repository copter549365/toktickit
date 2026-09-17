import type { ReactNode } from 'react';

interface EmptyStateProps {
  message?: string;
  action?: ReactNode;
}

/**
 * Zero-rows-with-no-filters state (ui-spec.md §3 "Empty") — distinct copy/icon from NoResultsState
 * so users can tell "you have nothing yet" apart from "your filters matched nothing" (AC-14 vs AC-15).
 */
export function EmptyState({
  message = "You haven't created any tickets yet.",
  action,
}: EmptyStateProps) {
  return (
    <div className="zg-state-panel">
      <div className="zg-state-panel__icon" aria-hidden="true">
        📭
      </div>
      <div className="zg-state-panel__message">{message}</div>
      {action}
    </div>
  );
}

export default EmptyState;
