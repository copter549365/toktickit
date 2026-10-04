export const SORTABLE_FIELDS = ['createdAt', 'ticketNumber', 'summary'] as const;
export type TicketSortField = (typeof SORTABLE_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const PAGE_SIZES = [10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const REQUESTED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RequestedPriority = (typeof REQUESTED_PRIORITIES)[number];

// Lab 3 — all 8 statuses (BR-12); was missing WAITING_FOR_REQUESTER/REOPENED, which silently
// dropped those filter values instead of applying them.
export const TICKET_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
] as const;
export type TicketStatusFilter = (typeof TICKET_STATUSES)[number];

export interface NormalizedTicketListQuery {
  search?: string;
  categoryId?: number;
  requestedPriority?: RequestedPriority;
  currentStatus?: TicketStatusFilter;
  sortBy: TicketSortField;
  sortOrder: SortOrder;
  page: number;
  pageSize: PageSize;
}

/**
 * Normalizes raw `GET /api/tickets` query params (api-spec.md §2). Every unknown or invalid value
 * degrades to its documented default rather than erroring (BR-27, BR-28, BR-29).
 */
export function normalizeTicketListQuery(query: Record<string, unknown>): NormalizedTicketListQuery {
  const sortBy = (SORTABLE_FIELDS as readonly string[]).includes(query.sortBy as string)
    ? (query.sortBy as TicketSortField)
    : 'createdAt';

  const sortOrder = (SORT_ORDERS as readonly string[]).includes(query.sortOrder as string)
    ? (query.sortOrder as SortOrder)
    : 'desc';

  const requestedPageSize = Number(query.pageSize);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requestedPageSize)
    ? (requestedPageSize as PageSize)
    : 10;

  const requestedPage = Number(query.page);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;

  const normalized: NormalizedTicketListQuery = { sortBy, sortOrder, page, pageSize };

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    normalized.search = search;
  }

  if (query.categoryId !== undefined && query.categoryId !== null && query.categoryId !== '') {
    const categoryId = Number(query.categoryId);
    if (Number.isInteger(categoryId) && categoryId > 0) {
      normalized.categoryId = categoryId;
    }
  }

  if ((REQUESTED_PRIORITIES as readonly string[]).includes(query.requestedPriority as string)) {
    normalized.requestedPriority = query.requestedPriority as RequestedPriority;
  }

  if ((TICKET_STATUSES as readonly string[]).includes(query.currentStatus as string)) {
    normalized.currentStatus = query.currentStatus as TicketStatusFilter;
  }

  return normalized;
}

/**
 * Escapes characters that act as wildcards or escape characters in SQL LIKE/ILIKE expressions.
 */
export function escapeLikeWildcards(text: string): string {
  return text.replace(/([\\%_])/g, '\\$1');
}

// ---------------------------------------------------------------------------
// IT Staff Ticket Queue (api-spec.md §3 "GET /api/staff/tickets")
// ---------------------------------------------------------------------------

export const STAFF_QUEUE_SORTABLE_FIELDS = [
  'createdAt',
  'ticketNumber',
  'requestedPriority',
  'itPriority',
  'currentStatus',
  'updatedAt',
] as const;
export type StaffQueueSortField = (typeof STAFF_QUEUE_SORTABLE_FIELDS)[number];

export interface NormalizedStaffQueueQuery {
  search?: string;
  categoryId?: number;
  requestedPriority?: RequestedPriority;
  itPriority?: RequestedPriority;
  currentStatus?: TicketStatusFilter;
  /** A specific staff user id, or 'unassigned' to find tickets with no owner. */
  ticketOwnerId?: number | 'unassigned';
  sortBy: StaffQueueSortField;
  sortOrder: SortOrder;
  page: number;
  pageSize: PageSize;
}

/**
 * Normalizes raw `GET /api/staff/tickets` query params (api-spec.md §3). Every unknown or
 * invalid value degrades to its documented default rather than erroring (FR-15, AC-05).
 */
export function normalizeStaffQueueQuery(query: Record<string, unknown>): NormalizedStaffQueueQuery {
  const sortBy = (STAFF_QUEUE_SORTABLE_FIELDS as readonly string[]).includes(query.sortBy as string)
    ? (query.sortBy as StaffQueueSortField)
    : 'createdAt';

  const sortOrder = (SORT_ORDERS as readonly string[]).includes(query.sortOrder as string)
    ? (query.sortOrder as SortOrder)
    : 'desc';

  const requestedPageSize = Number(query.pageSize);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requestedPageSize)
    ? (requestedPageSize as PageSize)
    : 10;

  const requestedPage = Number(query.page);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;

  const normalized: NormalizedStaffQueueQuery = { sortBy, sortOrder, page, pageSize };

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    normalized.search = search;
  }

  if (query.categoryId !== undefined && query.categoryId !== null && query.categoryId !== '') {
    const categoryId = Number(query.categoryId);
    if (Number.isInteger(categoryId) && categoryId > 0) {
      normalized.categoryId = categoryId;
    }
  }

  if ((REQUESTED_PRIORITIES as readonly string[]).includes(query.requestedPriority as string)) {
    normalized.requestedPriority = query.requestedPriority as RequestedPriority;
  }

  if ((REQUESTED_PRIORITIES as readonly string[]).includes(query.itPriority as string)) {
    normalized.itPriority = query.itPriority as RequestedPriority;
  }

  if ((TICKET_STATUSES as readonly string[]).includes(query.currentStatus as string)) {
    normalized.currentStatus = query.currentStatus as TicketStatusFilter;
  }

  if (query.ticketOwnerId === 'unassigned') {
    normalized.ticketOwnerId = 'unassigned';
  } else if (query.ticketOwnerId !== undefined && query.ticketOwnerId !== null && query.ticketOwnerId !== '') {
    const ownerId = Number(query.ticketOwnerId);
    if (Number.isInteger(ownerId) && ownerId > 0) {
      normalized.ticketOwnerId = ownerId;
    }
  }

  return normalized;
}

