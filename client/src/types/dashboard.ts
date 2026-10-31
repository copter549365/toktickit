import type { Priority, TicketStatus } from './ticket';

/** api-spec.md `DrillDown`: the client builds the URL as `path + "?" + URLSearchParams(query)`. */
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

/** api-spec.md `DashboardTicketItem`. */
export interface DashboardTicketItem {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: TicketStatus;
  itPriority: Priority | null;
  owner: { id: number; name: string } | null;
  /** D-18: the Urgent list shows each Ticket's age. */
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** D-18: FR-12 "Requester says resolved" pill on the staff lists. */
  requesterResolvedIndicator: boolean;
}

/** api-spec.md §3 `myOpenActions` item. */
export interface DashboardActionItem {
  actionId: number;
  ticketId: number;
  ticketNumber: string;
  ticketSummary: string;
  description: string;
  status: 'PLANNED' | 'IN_PROGRESS';
  actionAt: string;
  followUpRequired: boolean;
}

/** My Open Actions has `drillDown: null`: the list next to it is its drill-down. */
export interface StaffDashboardCard extends Omit<DashboardCard, 'drillDown'> {
  drillDown: DrillDown | null;
}

export interface StaffDashboardData {
  generatedAt: string;
  displayTimeZone: string;
  statusCards: DashboardCard[];
  workloadCards: StaffDashboardCard[];
  priorityCards: DashboardCard[];
  lists: {
    myOpenActions: { items: DashboardActionItem[] };
    urgent: DashboardList;
    recentlyUpdated: DashboardList;
  };
  /** Administrators only; `null` for IT Staff (BR-24). */
  userAccounts: DashboardCard[] | null;
}

export interface DashboardList {
  items: DashboardTicketItem[];
  viewAll: DrillDown;
}

export interface RequesterDashboardData {
  generatedAt: string;
  displayTimeZone: string;
  recentWindowDays: number;
  cards: DashboardCard[];
  lists: {
    attentionRequired: DashboardList;
    recentlyUpdated: DashboardList;
    recentlyResolved: DashboardList;
  };
}

/** Router state set by dashboard links, so the target list can show "Filtered from Dashboard". */
export interface DrillDownState {
  fromDashboard: true;
}

export function drillDownHref({ path, query }: DrillDown): string {
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
}
