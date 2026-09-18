import type { Priority, TicketStatus } from './ticket';

export type StaffQueueSortField =
  | 'createdAt'
  | 'ticketNumber'
  | 'requestedPriority'
  | 'itPriority'
  | 'currentStatus'
  | 'updatedAt';

export interface StaffTicketListItem {
  id: number;
  ticketNumber: string;
  createdAt: string;
  summary: string;
  category: { id: number; name: string };
  requestedPriority: Priority;
  itPriority: Priority | null;
  currentStatus: TicketStatus;
  requester: { id: number; name: string; email: string };
  owner: { id: number; name: string } | null;
  requesterResolvedIndicator: boolean;
  updatedAt: string;
}

export type OwnerFilter = 'all' | 'unassigned' | 'me';

export interface StaffQueueListParams {
  search?: string;
  categoryId?: number;
  requestedPriority?: Priority;
  itPriority?: Priority;
  currentStatus?: TicketStatus;
  /** A specific staff user id, or 'unassigned'. Omit for "All". */
  ticketOwnerId?: number | 'unassigned';
  sortBy?: StaffQueueSortField;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: 10 | 20 | 50;
}

export interface StaffQueueListMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface StaffQueueListResponse {
  data: StaffTicketListItem[];
  meta: StaffQueueListMeta;
}
