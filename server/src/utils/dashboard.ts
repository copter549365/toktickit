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
  /** D-18: lets the Urgent list show each Ticket's age. */
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  /** D-18: FR-12 shows the advisory "Requester says resolved" pill on the staff dashboard lists. */
  requesterResolvedIndicator: boolean;
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
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt ?? null,
    requesterResolvedIndicator: ticket.requesterResolvedIndicator,
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
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  requesterResolvedIndicator: true,
} as const;

// ---------------------------------------------------------------------------
// IT Staff and Administrator dashboard (BR-23, BR-24, api-spec.md §3)
// ---------------------------------------------------------------------------

/** BR-23 status cards, in workflow order. CLOSED and CANCELLED are final and have no card. */
export const STATUS_CARD_STATUSES = [
  ['NEW', 'New'],
  ['OPEN', 'Open'],
  ['IN_PROGRESS', 'In Progress'],
  ['WAITING_FOR_REQUESTER', 'Waiting for Requester'],
  ['REOPENED', 'Reopened'],
  ['RESOLVED', 'Resolved'],
] as const;

export const IT_PRIORITIES = [
  ['LOW', 'Low'],
  ['MEDIUM', 'Medium'],
  ['HIGH', 'High'],
] as const;

const QUEUE = '/staff/tickets';

export interface StaffDashboardCard extends Omit<DashboardCard, 'drillDown'> {
  drillDown: DrillDown | null;
}

export function buildStatusCards(counts: Partial<Record<string, number>>): DashboardCard[] {
  return STATUS_CARD_STATUSES.map(([key, label]) => ({
    key,
    label,
    value: counts[key] ?? 0,
    drillDown: { path: QUEUE, query: { currentStatus: key } },
  }));
}

export interface WorkloadCounts {
  unassignedActive: number;
  myActive: number;
  requesterMarkedResolved: number;
  myOpenActions: number;
}

/** "me" is the caller's user id, so My Assigned drills to the Queue filtered on that owner. */
export function buildWorkloadCards(meId: number, counts: WorkloadCounts): StaffDashboardCard[] {
  return [
    { key: 'unassignedActive', label: 'Unassigned', value: counts.unassignedActive, drillDown: { path: QUEUE, query: { ticketOwnerId: 'unassigned', statusGroup: 'active' } } },
    { key: 'myActive', label: 'My Assigned', value: counts.myActive, drillDown: { path: QUEUE, query: { ticketOwnerId: String(meId), statusGroup: 'active' } } },
    { key: 'requesterMarkedResolved', label: 'Marked Resolved by Requester', value: counts.requesterMarkedResolved, drillDown: { path: QUEUE, query: { statusGroup: 'active', requesterResolvedIndicator: 'true' } } },
    // The My Open Actions list next to the card is its drill-down (api-spec §3).
    { key: 'myOpenActions', label: 'My Open Actions', value: counts.myOpenActions, drillDown: null },
  ];
}

export function buildPriorityCards(counts: Partial<Record<string, number>>): DashboardCard[] {
  return IT_PRIORITIES.map(([key, label]) => ({
    key,
    label,
    value: counts[key] ?? 0,
    drillDown: { path: QUEUE, query: { itPriority: key, statusGroup: 'active' } },
  }));
}

export interface UserAccountCounts {
  activeRequesters: number;
  activeItStaff: number;
  activeAdministrators: number;
  inactiveUsers: number;
}

/** BR-24 with D-18: each drill-down carries `isActive`, so the list shows exactly the card's users. */
export function buildUserAccountCards(counts: UserAccountCounts): DashboardCard[] {
  return [
    { key: 'activeRequesters', label: 'Active Requesters', value: counts.activeRequesters, drillDown: { path: '/admin/users', query: { role: 'REQUESTER', isActive: 'true' } } },
    { key: 'activeItStaff', label: 'Active IT Staff', value: counts.activeItStaff, drillDown: { path: '/admin/users', query: { role: 'IT_STAFF', isActive: 'true' } } },
    { key: 'activeAdministrators', label: 'Active Administrators', value: counts.activeAdministrators, drillDown: { path: '/admin/users', query: { role: 'ADMINISTRATOR', isActive: 'true' } } },
    { key: 'inactiveUsers', label: 'Inactive Accounts', value: counts.inactiveUsers, drillDown: { path: '/admin/users', query: { isActive: 'false' } } },
  ];
}

export const STAFF_LIST_VIEW_ALL: Record<'urgent' | 'recentlyUpdated', DrillDown> = {
  urgent: { path: QUEUE, query: { itPriority: 'HIGH', statusGroup: 'active', sortBy: 'createdAt', sortOrder: 'asc' } },
  recentlyUpdated: { path: QUEUE, query: { sortBy: 'updatedAt', sortOrder: 'desc' } },
};

export interface DashboardActionSource {
  id: number;
  ticketId: number;
  description: string;
  status: string;
  actionAt: Date;
  followUpRequired: boolean;
  ticket: { ticketNumber: string; summary: string };
}

/** api-spec.md §3 `myOpenActions` item. Rows link to `/staff/tickets/:ticketId#actions-taken`. */
export function toDashboardActionItem(action: DashboardActionSource) {
  return {
    actionId: action.id,
    ticketId: action.ticketId,
    ticketNumber: action.ticket.ticketNumber,
    ticketSummary: action.ticket.summary,
    description: action.description,
    status: action.status,
    actionAt: action.actionAt,
    followUpRequired: action.followUpRequired,
  };
}

export const DASHBOARD_ACTION_SELECT = {
  id: true,
  ticketId: true,
  description: true,
  status: true,
  actionAt: true,
  followUpRequired: true,
  ticket: { select: { ticketNumber: true, summary: true } },
} as const;
