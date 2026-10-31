import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchRequesterDashboard } from '../api/dashboard';
import { Badge } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import {
  DashboardForbidden,
  DashboardHeader,
  DashboardLoading,
  DashboardSection,
  EmptyListLine,
  MetricGrid,
} from '../components/DashboardParts';
import { useDashboard } from '../hooks/useDashboard';
import type { DashboardList, DashboardTicketItem } from '../types/dashboard';
import { formatBangkokDateTime } from '../utils/bangkokTime';

const ATTENTION_HINT: Partial<Record<DashboardTicketItem['currentStatus'], string>> = {
  WAITING_FOR_REQUESTER: 'Staff are waiting for your reply',
  RESOLVED: 'Please confirm the fix',
};

interface ListProps {
  id: string;
  title: string;
  list: DashboardList;
  emptyMessage: string;
  date: (item: DashboardTicketItem) => string;
  showHints?: boolean;
}

function TicketListSection({ id, title, list, emptyMessage, date, showHints }: ListProps) {
  return (
    <DashboardSection id={id} title={title} viewAll={list.viewAll}>
      {list.items.length === 0 ? (
        <EmptyListLine>{emptyMessage}</EmptyListLine>
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
    </DashboardSection>
  );
}

/**
 * Requester Dashboard (docs/lab-04/ui-spec.md §3; FR-13, BR-22, BR-25). Every number comes from
 * GET /api/dashboard/requester; the client never counts Tickets itself (BR-21).
 */
export function RequesterDashboard() {
  const { user } = useAuth();
  const { state, isRefreshing, refresh, retry } = useDashboard(fetchRequesterDashboard);

  const firstName = user?.name.split(' ')[0] ?? '';
  const data = state.kind === 'ready' ? state.data : null;
  const hasNoTickets = Boolean(data && data.cards.every((c) => c.value === 0) && data.lists.recentlyUpdated.items.length === 0);

  return (
    <div className="container-fluid p-0">
      <DashboardHeader
        title={`Welcome, ${firstName}!`}
        subtitle="Here's the latest on your requests."
        generatedAt={data?.generatedAt ?? null}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
      />

      {state.kind === 'loading' && <DashboardLoading cards={4} gridClassName="zg-metric-grid--requester" />}
      {state.kind === 'failure' && <ErrorState message="Something went wrong. Please try again." onRetry={retry} />}
      {state.kind === 'forbidden' && <DashboardForbidden />}

      {data && (
        <>
          <MetricGrid label="Ticket summary" cards={data.cards} className="zg-metric-grid--requester" />

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
              <DashboardSection id="quick-actions" title="Quick Actions">
                <div className="d-grid gap-2 mt-2">
                  <Link to="/tickets/new" className="btn btn-zg-primary">
                    <span aria-hidden="true">+ </span>Create Ticket
                  </Link>
                  <Link to="/tickets" className="btn btn-zg-secondary">
                    <span aria-hidden="true">▤ </span>View My Tickets
                  </Link>
                </div>
              </DashboardSection>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default RequesterDashboard;
