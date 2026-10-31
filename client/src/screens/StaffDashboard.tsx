import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchStaffDashboard } from '../api/dashboard';
import { Badge, FollowUpPill, RequesterSaysResolvedPill } from '../components/Badge';
import { ErrorState } from '../components/ErrorState';
import {
  DRILL_DOWN_STATE,
  DashboardForbidden,
  DashboardHeader,
  DashboardLoading,
  DashboardSection,
  EmptyListLine,
  MetricGrid,
} from '../components/DashboardParts';
import { useDashboard } from '../hooks/useDashboard';
import type { DashboardActionItem, DashboardList, DashboardTicketItem } from '../types/dashboard';
import type { Priority } from '../types/ticket';
import { formatBangkokDateTime } from '../utils/bangkokTime';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "opened 3 days ago" for the Urgent list (ui-spec §4, D-18). */
function formatAge(createdAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS);
  if (days < 1) return 'opened today';
  return `opened ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

function ActionRows({ items }: { items: DashboardActionItem[] }) {
  return (
    <ul className="zg-dashboard-list">
      {items.map((action) => (
        <li key={action.actionId}>
          <Link
            to={`/staff/tickets/${action.ticketId}#actions-taken`}
            className="font-monospace small fw-semibold zg-dashboard-list__ticket"
            title={action.ticketSummary}
          >
            {action.ticketNumber}
          </Link>
          <span className="zg-dashboard-list__summary" title={action.description}>
            {action.description}
          </span>
          <Badge kind="actionStatus" value={action.status} />
          <span className="zg-dashboard-list__meta">{formatBangkokDateTime(action.actionAt)}</span>
          {action.followUpRequired && <FollowUpPill />}
        </li>
      ))}
    </ul>
  );
}

interface TicketRowsProps {
  list: DashboardList;
  meta: (item: DashboardTicketItem) => string;
  showOwner?: boolean;
}

function TicketRows({ list, meta, showOwner }: TicketRowsProps) {
  return (
    <ul className="zg-dashboard-list">
      {list.items.map((item) => (
        <li key={item.id}>
          <Link to={`/staff/tickets/${item.id}`} className="font-monospace small fw-semibold zg-dashboard-list__ticket">
            {item.ticketNumber}
          </Link>
          <span className="zg-dashboard-list__summary" title={item.summary}>
            {item.summary}
          </span>
          <Badge kind="status" value={item.currentStatus} />
          {item.requesterResolvedIndicator && <RequesterSaysResolvedPill />}
          {showOwner &&
            (item.owner ? (
              <span className="zg-dashboard-list__meta">{item.owner.name}</span>
            ) : (
              <span className="zg-badge badge-triage-pending">Unassigned</span>
            ))}
          <span className="zg-dashboard-list__meta">{meta(item)}</span>
        </li>
      ))}
    </ul>
  );
}

interface StaffDashboardProps {
  /** Clock for the Urgent list's age; injectable for tests. */
  now?: () => Date;
}

/**
 * IT Staff and Administrator Dashboard (docs/lab-04/ui-spec.md §4; FR-14, FR-15, BR-23, BR-24).
 * Every number comes from GET /api/dashboard/staff. Administrators also see User Accounts.
 */
export function StaffDashboard({ now = () => new Date() }: StaffDashboardProps) {
  const { user } = useAuth();
  const { state, isRefreshing, refresh, retry } = useDashboard(fetchStaffDashboard);

  const firstName = user?.name.split(' ')[0] ?? '';
  const data = state.kind === 'ready' ? state.data : null;
  const unassigned = data?.workloadCards.find((c) => c.key === 'unassignedActive')?.drillDown;

  return (
    <div className="container-fluid p-0">
      <DashboardHeader
        title={`Welcome back, ${firstName}!`}
        subtitle="Here's what's happening with the queue today."
        generatedAt={data?.generatedAt ?? null}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
      />

      {state.kind === 'loading' && <DashboardLoading cards={6} gridClassName="zg-metric-grid--status" />}
      {state.kind === 'failure' && <ErrorState message="Something went wrong. Please try again." onRetry={retry} />}
      {state.kind === 'forbidden' && <DashboardForbidden />}

      {data && (
        <>
          <h2 className="zg-dashboard-group-title">Status</h2>
          <MetricGrid label="Ticket status" cards={data.statusCards} className="zg-metric-grid--status" />

          <h2 className="zg-dashboard-group-title">Workload</h2>
          <MetricGrid label="Workload" cards={data.workloadCards} className="zg-metric-grid--four" />

          <h2 className="zg-dashboard-group-title">IT Priority (active tickets)</h2>
          <MetricGrid
            label="IT Priority (active tickets)"
            cards={data.priorityCards}
            className="zg-metric-grid--three"
            renderLabel={(card) => <Badge kind="priority" value={card.key as Priority} />}
          />

          <div className="row g-3">
            <div className="col-12 col-lg-8">
              <DashboardSection id="my-open-actions" title="My Open Actions">
                {data.lists.myOpenActions.items.length === 0 ? (
                  <EmptyListLine>You have no planned or in-progress actions.</EmptyListLine>
                ) : (
                  <ActionRows items={data.lists.myOpenActions.items} />
                )}
              </DashboardSection>
              <DashboardSection id="staff-recently-updated" title="Recently Updated" viewAll={data.lists.recentlyUpdated.viewAll}>
                {data.lists.recentlyUpdated.items.length === 0 ? (
                  <EmptyListLine>No recent updates.</EmptyListLine>
                ) : (
                  <TicketRows list={data.lists.recentlyUpdated} meta={(i) => `Updated ${formatBangkokDateTime(i.updatedAt)}`} />
                )}
              </DashboardSection>
            </div>
            <div className="col-12 col-lg-4">
              <DashboardSection id="urgent-tickets" title="Urgent Tickets" viewAll={data.lists.urgent.viewAll}>
                <p className="small text-muted mb-2">High IT Priority, oldest first.</p>
                {data.lists.urgent.items.length === 0 ? (
                  <EmptyListLine>No high-priority tickets are open.</EmptyListLine>
                ) : (
                  <TicketRows list={data.lists.urgent} meta={(i) => formatAge(i.createdAt, now())} showOwner />
                )}
              </DashboardSection>
              <DashboardSection id="quick-actions" title="Quick Actions">
                <div className="d-grid gap-2 mt-2">
                  <Link to="/staff/tickets" className="btn btn-zg-primary">
                    <span aria-hidden="true">▤ </span>Ticket Queue
                  </Link>
                  {unassigned && (
                    <Link
                      to={`/staff/tickets?${new URLSearchParams(unassigned.query).toString()}`}
                      state={DRILL_DOWN_STATE}
                      className="btn btn-zg-secondary"
                    >
                      <span aria-hidden="true">◌ </span>Unassigned tickets
                    </Link>
                  )}
                </div>
              </DashboardSection>
            </div>
          </div>

          {data.userAccounts && (
            <>
              <h2 className="zg-dashboard-group-title">User Accounts</h2>
              <MetricGrid label="User Accounts" cards={data.userAccounts} className="zg-metric-grid--four" actionLabel="View users" />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default StaffDashboard;
