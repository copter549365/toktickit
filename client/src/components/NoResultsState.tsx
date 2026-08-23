import type { ReactNode } from 'react';

interface NoResultsStateProps {
  message?: string;
  action?: ReactNode;
}

/**
 * Filters/search applied but matched nothing (ui-spec.md §3 "No-results") — visually distinct
 * from EmptyState so a filtered-out list is never mistaken for a genuinely empty one (AC-14).
 */
export function NoResultsState({
  message = 'No tickets match your filters.',
  action,
}: NoResultsStateProps) {
  return (
    <div className="zg-state-panel">
      <div className="zg-state-panel__icon" aria-hidden="true">
        🔍
      </div>
      <div className="zg-state-panel__message">{message}</div>
      {action}
    </div>
  );
}

export default NoResultsState;
