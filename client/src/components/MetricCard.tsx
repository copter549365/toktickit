import { Link } from 'react-router-dom';
import { drillDownHref, type DashboardCard, type DrillDownState } from '../types/dashboard';

const DRILL_DOWN_STATE: DrillDownState = { fromDashboard: true };

/**
 * Dashboard metric card (docs/lab-04/ui-spec.md §1.4): the whole card is one link to the filtered
 * list. A zero stays visible and clickable (BR-25).
 */
export function MetricCard({ card }: { card: DashboardCard }) {
  return (
    <Link
      to={drillDownHref(card.drillDown)}
      state={DRILL_DOWN_STATE}
      className="zg-metric-card"
      aria-label={`${card.label}: ${card.value}. View tickets`}
      data-testid={`metric-${card.key}`}
    >
      <span className="zg-metric-card__label">{card.label}</span>
      <span className="zg-metric-card__value">{card.value}</span>
      {card.value === 0 && <span className="zg-metric-card__helper">Nothing here right now</span>}
      <span className="zg-metric-card__footer" aria-hidden="true">
        View all →
      </span>
    </Link>
  );
}

export default MetricCard;
