import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchRequesterDashboard } from '../api/dashboard';
import { ApiError } from '../api/tickets';
import { Badge } from '../components/Badge';
import { MetricCard } from '../components/MetricCard';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import {
  drillDownHref,
  type DashboardList,
  type DashboardTicketItem,
  type DrillDownState,
  type RequesterDashboardData,
} from '../types/dashboard';
import { formatBangkokDateTime } from '../utils/bangkokTime';

const DRILL_DOWN_STATE: DrillDownState = { fromDashboard: true };

/** "Updated hh:mm (UTC+7)" from the server's generatedAt (BR-21: display in Asia/Bangkok). */
function formatUpdatedAt(iso: string): string {
  const time = new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `Updated ${time} (UTC+7)`;
}

const ATTENTION_HINT: Partial<Record<DashboardTicketItem['currentStatus'], string>> = {
  WAITING_FOR_REQUESTER: 'Staff are waiting for your reply',
  RESOLVED: 'Please confirm the fix',
};

interface SectionProps {
  id: string;
  title: string;
  list: DashboardList;
  emptyMessage: string;
  date: (item: DashboardTicketItem) => string;
  showHints?: boolean;
}

function TicketListSection({ id, title, list, emptyMessage, date, showHints }: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section className="zg-dashboard-section" aria-labelledby={headingId}>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
        <h2 id={headingId}>{title}</h2>
        <Link
          to={drillDownHref(list.viewAll)}
          state={DRILL_DOWN_STATE}
          className="small fw-semibold text-nowrap"
          style={{ color: 'var(--color-secondary)' }}
          aria-label={`View all ${title}`}
        >
          View all
        </Link>
      </div>
      {list.items.length === 0 ? (
        <p className="text-muted small mb-0">{emptyMessage}</p>
      ) : (
        <ul className="zg-dashboard-list">
          {list.items.map((item) => (
            <li key={item.id}>
              <Link to={`/tickets/${item.id}`} className="font-monospace small fw-semibold zg-dashboard-list__ticket">
                {item.ticketNumber}
              </Link>
              <span className="zg-dashboard-list__summary" title={item.summary}>
                {item.summary}
              </span>
              <Badge kind="status" value={item.currentStatus} />
              <span className="zg-dashboard-list__meta">{date(item)}</span>
              {showHints && ATTENTION_HINT[item.currentStatus] && (
                <span className="zg-dashboard-list__hint">{ATTENTION_HINT[item.currentStatus]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: RequesterDashboardData }
  | { kind: 'failure' }
  | { kind: 'forbidden' };

/**
 * Requester Dashboard (docs/lab-04/ui-spec.md §3; FR-13, BR-22, BR-25). Every number comes from
 * GET /api/dashboard/requester; the client never counts Tickets itself (BR-21).
 */
export function RequesterDashboard() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsRefreshing(true);
    try {
      const data = await fetchRequesterDashboard({ signal: controller.signal });
      if (!controller.signal.aborted) setState({ kind: 'ready', data });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState(err instanceof ApiError && err.status === 403 ? { kind: 'forbidden' } : { kind: 'failure' });
    } finally {
      if (!controller.signal.aborted) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const retry = () => {
    setState({ kind: 'loading' });
    load();
  };

  const firstName = user?.name.split(' ')[0] ?? '';
  const data = state.kind === 'ready' ? state.data : null;
  const hasNoTickets = Boolean(data && data.cards.every((c) => c.value === 0) && data.lists.recentlyUpdated.items.length === 0);

  return (
    <div className="container-fluid p-0">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-2 mb-4">
        <div>
          <h1 className="h4 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            Welcome, {firstName}!
          </h1>
          <p className="text-muted small mb-0">Here's the latest on your requests.</p>
        </div>
        {data && (
          <div className="d-flex align-items-center gap-3">
            <span className="zg-dashboard-updated">{formatUpdatedAt(data.generatedAt)}</span>
            <button
              type="button"
              className="btn btn-zg-secondary"
              onClick={load}
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

      {state.kind === 'loading' && (
        <div data-testid="dashboard-loading" aria-busy="true">
          <span className="visually-hidden">Loading…</span>
          <ul className="zg-metric-grid zg-metric-grid--requester" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="zg-skeleton" />
            ))}
          </ul>
        </div>
      )}

      {state.kind === 'failure' && <ErrorState message="Something went wrong. Please try again." onRetry={retry} />}

      {state.kind === 'forbidden' && (
        <div className="zg-state-panel" role="alert">
          <div className="zg-state-panel__icon" aria-hidden="true">
            🔒
          </div>
          <div className="zg-state-panel__message">You don't have access to this page.</div>
          <Link to="/dashboard" className="btn btn-zg-primary">
            Go to Dashboard
          </Link>
        </div>
      )}

      {data && (
        <>
          <ul className="zg-metric-grid zg-metric-grid--requester" aria-label="Ticket summary">
            {data.cards.map((card) => (
              <li key={card.key}>
                <MetricCard card={card} />
              </li>
            ))}
          </ul>

          <div className="row g-3">
            <div className="col-12 col-lg-8">
              {hasNoTickets ? (
                <div className="zg-dashboard-section">
                  <EmptyState
                    message="You haven't created any tickets yet"
                    action={
                      <Link to="/tickets/new" className="btn btn-zg-primary">
                        Create your first ticket
                      </Link>
                    }
                  />
                </div>
              ) : (
                <>
                  <TicketListSection
                    id="attention-required"
                    title="Needs My Attention"
                    list={data.lists.attentionRequired}
                    emptyMessage="No tickets need your attention."
                    date={(i) => `Updated ${formatBangkokDateTime(i.updatedAt)}`}
                    showHints
                  />
                  <TicketListSection
                    id="recently-updated"
                    title="Recently Updated"
                    list={data.lists.recentlyUpdated}
                    emptyMessage="No recent updates."
                    date={(i) => `Updated ${formatBangkokDateTime(i.updatedAt)}`}
                  />
                  <TicketListSection
                    id="recently-resolved"
                    title="Recently Resolved"
                    list={data.lists.recentlyResolved}
                    emptyMessage={`No tickets were resolved in the last ${data.recentWindowDays} days.`}
                    date={(i) => `Resolved ${formatBangkokDateTime(i.resolvedAt ?? i.updatedAt)}`}
                  />
                </>
              )}
            </div>
            <div className="col-12 col-lg-4">
              <section className="zg-dashboard-section" aria-labelledby="quick-actions-heading">
                <h2 id="quick-actions-heading" className="mb-3">
                  Quick Actions
                </h2>
                <div className="d-grid gap-2">
                  <Link to="/tickets/new" className="btn btn-zg-primary">
                    <span aria-hidden="true">+ </span>Create Ticket
                  </Link>
                  <Link to="/tickets" className="btn btn-zg-secondary">
                    <span aria-hidden="true">▤ </span>View My Tickets
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default RequesterDashboard;
