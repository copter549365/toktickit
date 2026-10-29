// docs/lab-04/api-spec.md §0.4 "ActionTaken"
export type ActionTakenStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface UserRef {
  id: number;
  name: string;
}

export interface ActionTaken {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionTakenStatus;
  assignee: UserRef;
  performedBy: UserRef | null;
  createdBy: UserRef;
  lastUpdatedBy: UserRef;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionListResponse {
  data: ActionTaken[];
  meta: { totalCount: number; openCount: number; completedCount: number };
}

export interface CreateActionInput {
  clientRequestId: string;
  /** Omitted when the user kept the default, so the server records its own now (BR-03). */
  actionAt?: string;
  description: string;
  result?: string;
  status: Exclude<ActionTakenStatus, 'CANCELLED'>;
  assigneeId: number;
  followUpRequired: boolean;
  followUpNote?: string;
  attachmentNotes?: string;
}

export type UpdateActionInput = Partial<{
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionTakenStatus;
  assigneeId: number;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  cancelReason: string;
}> & { expectedVersion: number };

// docs/lab-04/specification.md BR-09: actions can be recorded only while the Ticket is being worked on.
export const ACTION_WRITABLE_TICKET_STATUSES: readonly string[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'REOPENED',
];

export function isOpenAction(status: ActionTakenStatus): boolean {
  return status === 'PLANNED' || status === 'IN_PROGRESS';
}
