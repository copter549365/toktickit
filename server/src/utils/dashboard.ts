/**
 * Dashboard calculation rules (specification.md BR-21..BR-25, api-spec.md §3). Pure helpers only;
 * the routes in app.ts run the queries and pass the results through these.
 */

/** BR-21: the statuses that count as "active" (open work) on every dashboard. */
export const ACTIVE_TICKET_STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const;

export const RECENT_WINDOW_DAYS = 7;
export const DASHBOARD_LIST_LIMIT = 5;
export const DISPLAY_TIME_ZONE = 'Asia/Bangkok';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DrillDown {
  path: string;
  query: Record<string, string>;
}

export interface DashboardCard {
  key: string;
  label: string;
  value: number;
  drillDown: DrillDown;
}

/** BR-21: rolling window `[now − 7 × 24 h, now]`, independent of calendar days and time zone. */
export function recentWindowStart(now: Date): Date {
  return new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS);
}

export interface RequesterCounts {
  openTickets: number;
  waitingForMe: number;
  resolved: number;
  closed: number;
}

/** BR-22: the four Requester cards, in display order, each linking to a filtered My Tickets. */
export function buildRequesterCards(counts: RequesterCounts): DashboardCard[] {
  return [
    { key: 'openTickets', label: 'My Open Tickets', value: counts.openTickets, drillDown: { path: '/tickets', query: { statusGroup: 'active' } } },
    { key: 'waitingForMe', label: 'Waiting for Me', value: counts.waitingForMe, drillDown: { path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } } },
    { key: 'resolved', label: 'Resolved', value: counts.resolved, drillDown: { path: '/tickets', query: { currentStatus: 'RESOLVED' } } },
    { key: 'closed', label: 'Closed', value: counts.closed, drillDown: { path: '/tickets', query: { currentStatus: 'CLOSED' } } },
  ];
}

/** api-spec.md §3: "View all" targets for the Requester lists. */
export const REQUESTER_LIST_VIEW_ALL: Record<'attentionRequired' | 'recentlyUpdated' | 'recentlyResolved', DrillDown> = {
  attentionRequired: { path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } },
  recentlyUpdated: { path: '/tickets', query: { sortBy: 'updatedAt', sortOrder: 'desc' } },
  recentlyResolved: { path: '/tickets', query: { currentStatus: 'RESOLVED' } },
};

export interface DashboardTicketSource {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: string;
  itPriority: string | null;
  ticketOwner: { id: number; name: string } | null;
  updatedAt: Date;
  resolvedAt: Date | null;
}

/** api-spec.md `DashboardTicketItem`: the concise list item. Never a description or children. */
export function toDashboardTicketItem(ticket: DashboardTicketSource) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    summary: ticket.summary,
    currentStatus: ticket.currentStatus,
    itPriority: ticket.itPriority ?? null,
    owner: ticket.ticketOwner ?? null,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt ?? null,
  };
}

/** Prisma `select` for `toDashboardTicketItem`, so list queries fetch only what they return. */
export const DASHBOARD_TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  itPriority: true,
  ticketOwner: { select: { id: true, name: true } },
  updatedAt: true,
  resolvedAt: true,
} as const;
