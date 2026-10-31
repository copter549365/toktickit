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
  updatedAt: string;
  resolvedAt: string | null;
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
