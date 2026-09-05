import type { Attachment } from './attachment';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
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
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends Ticket {
  relatedSystemName: string;
  attachments: Attachment[];
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
  categoryId: number;
  categoryName: string;
  requestedPriority: Priority;
  itPriority: Priority | null;
  currentStatus: TicketStatus;
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
