import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { drillDownHref, type DrillDown, type DrillDownState } from '../types/dashboard';

const DRILL_DOWN_STATE: DrillDownState = { fromDashboard: true };

/** In-page target for a card whose drill-down is the list next to it (My Open Actions). */
const IN_PAGE_TARGETS: Record<string, string> = { myOpenActions: '#my-open-actions' };

interface MetricCardProps {
  card: { key: string; label: string; value: number; drillDown: DrillDown | null };
  /** End of the accessible name, e.g. "View tickets" or "View users". */
  actionLabel?: string;
  /** Visible label content, e.g. a priority badge; defaults to the card label. */
  label?: ReactNode;
}

/**
 * Dashboard metric card (docs/lab-04/ui-spec.md §1.4): the whole card is one link to the filtered
 * list. A zero stays visible and clickable (BR-25).
 */
export function MetricCard({ card, actionLabel = 'View tickets', label }: MetricCardProps) {
  const body = (
    <>
      <span className="zg-metric-card__label">{label ?? card.label}</span>
      <span className="zg-metric-card__value">{card.value}</span>
      {card.value === 0 && <span className="zg-metric-card__helper">Nothing here right now</span>}
      <span className="zg-metric-card__footer" aria-hidden="true">
        {card.drillDown ? 'View all →' : 'See list ↓'}
      </span>
    </>
  );

  if (!card.drillDown) {
    return (
      <a
        href={IN_PAGE_TARGETS[card.key] ?? '#'}
        className="zg-metric-card"
        aria-label={`${card.label}: ${card.value}. View the list below`}
        data-testid={`metric-${card.key}`}
      >
        {body}
      </a>
    );
  }

  return (
    <Link
      to={drillDownHref(card.drillDown)}
      state={DRILL_DOWN_STATE}
      className="zg-metric-card"
      aria-label={`${card.label}: ${card.value}. ${actionLabel}`}
      data-testid={`metric-${card.key}`}
    >
      {body}
    </Link>
  );
}

export default MetricCard;
