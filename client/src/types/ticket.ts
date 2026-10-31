import type { Attachment } from './attachment';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED';

export interface Ticket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  categoryName?: string;
  relatedSystemId: number;
  relatedSystemName?: string;
  summary: string;
  description: string;
  requestedPriority: Priority;
  itPriority: Priority | null;
  currentStatus: TicketStatus;
  ticketOwnerId: number | null;
  requesterResolvedIndicator: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends Ticket {
  relatedSystemName: string;
  ticketOwnerName: string | null;
  publicCommentsCount: number;
  attachments: Attachment[];
  // Lab 4 api-spec §2.1
  version?: number;
  resolvedAt?: string | null;
  permittedNextStatuses?: TicketStatus[];
}

// Lab 4 api-spec §2.1 / §2.4
export type ResolutionConditionKey = 'HAS_OWNER' | 'HAS_COMPLETED_ACTION' | 'NO_OPEN_ACTIONS';

export interface ResolutionGate {
  met: boolean;
  conditions: { key: ResolutionConditionKey; met: boolean; label: string }[];
  warnings: string[];
}

export interface StatusHistoryEntry {
  id: number;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedBy: { id: number; name: string } | null;
  note: string | null;
  isMigrated: boolean;
  createdAt: string;
}

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  requestedPriority: Priority;
  itPriority: Priority | null;
  currentStatus: TicketStatus;
  requesterResolvedIndicator: boolean;
  owner: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type TicketSortField = 'createdAt' | 'ticketNumber' | 'summary';
export type SortOrder = 'asc' | 'desc';
export type PageSize = 10 | 20 | 50;

export interface TicketListParams {
  search?: string;
  categoryId?: number;
  requestedPriority?: Priority;
  currentStatus?: TicketStatus;
  sortBy?: TicketSortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: PageSize;
}

export interface TicketListMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface TicketListResponse {
  data: TicketListItem[];
  meta: TicketListMeta;
}
