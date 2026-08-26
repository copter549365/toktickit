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

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
}
