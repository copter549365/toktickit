import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MetricCard } from './MetricCard';
import { drillDownHref, type DrillDown, type DrillDownState, type StaffDashboardCard } from '../types/dashboard';

/** Shared pieces of the Requester and IT Staff dashboards (docs/lab-04/ui-spec.md §3, §4, §8). */

export const DRILL_DOWN_STATE: DrillDownState = { fromDashboard: true };

/** "Updated hh:mm (UTC+7)" from the server's generatedAt (BR-21: display in Asia/Bangkok). */
export function formatUpdatedAt(iso: string): string {
  const time = new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `Updated ${time} (UTC+7)`;
}

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  generatedAt: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function DashboardHeader({ title, subtitle, generatedAt, isRefreshing, onRefresh }: DashboardHeaderProps) {
  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-2 mb-4">
      <div>
        <h1 className="h4 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
          {title}
        </h1>
        <p className="text-muted small mb-0">{subtitle}</p>
      </div>
      {generatedAt && (
        <div className="d-flex align-items-center gap-3">
          <span className="zg-dashboard-updated">{formatUpdatedAt(generatedAt)}</span>
          <button
            type="button"
            className="btn btn-zg-secondary"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-disabled={isRefreshing}
          >
            {isRefreshing ? (
              <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">⟳ </span>
            )}
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

/** Skeleton cards with aria-busy (ui-spec §8 "Loading"). */
export function DashboardLoading({ cards, gridClassName }: { cards: number; gridClassName: string }) {
  return (
    <div data-testid="dashboard-loading" aria-busy="true">
      <span className="visually-hidden">Loading…</span>
      <ul className={`zg-metric-grid ${gridClassName}`} aria-hidden="true">
        {Array.from({ length: cards }, (_, i) => (
          <li key={i} className="zg-skeleton" />
        ))}
      </ul>
    </div>
  );
}

/** ui-spec §8 "Forbidden (403)". */
export function DashboardForbidden() {
  return (
    <div className="zg-state-panel" role="alert">
      <div className="zg-state-panel__icon" aria-hidden="true">
        🔒
      </div>
      <div className="zg-state-panel__message">You don't have access to this page.</div>
      <Link to="/dashboard" className="btn btn-zg-primary">
        Go to Dashboard
      </Link>
    </div>
  );
}

interface MetricGridProps {
  label: string;
  cards: StaffDashboardCard[];
  className: string;
  actionLabel?: string;
  renderLabel?: (card: StaffDashboardCard) => ReactNode;
}

/** A labelled `<ul>` of metric cards, one link each (ui-spec §10). */
export function MetricGrid({ label, cards, className, actionLabel, renderLabel }: MetricGridProps) {
  return (
    <ul className={`zg-metric-grid ${className}`} aria-label={label}>
      {cards.map((card) => (
        <li key={card.key}>
          <MetricCard card={card} actionLabel={actionLabel} label={renderLabel?.(card)} />
        </li>
      ))}
    </ul>
  );
}

interface DashboardSectionProps {
  id: string;
  title: string;
  viewAll?: DrillDown;
  children: ReactNode;
}

/** A dashboard panel with an `<h2>` and an optional "View all" drill-down. */
export function DashboardSection({ id, title, viewAll, children }: DashboardSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section className="zg-dashboard-section" id={id} aria-labelledby={headingId}>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
        <h2 id={headingId} tabIndex={-1}>
          {title}
        </h2>
        {viewAll && (
          <Link
            to={drillDownHref(viewAll)}
            state={DRILL_DOWN_STATE}
            className="small fw-semibold text-nowrap"
            style={{ color: 'var(--color-secondary)' }}
            aria-label={`View all ${title}`}
          >
            View all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** A one-line empty message for a dashboard list (BR-25). */
export function EmptyListLine({ children }: { children: ReactNode }) {
  return <p className="text-muted small mb-0">{children}</p>;
}
