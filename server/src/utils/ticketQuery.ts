export const SORTABLE_FIELDS = ['createdAt', 'ticketNumber', 'summary'] as const;
export type TicketSortField = (typeof SORTABLE_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const PAGE_SIZES = [10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const REQUESTED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RequestedPriority = (typeof REQUESTED_PRIORITIES)[number];

export const TICKET_STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
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

  const categoryId = Number(query.categoryId);
  if (Number.isInteger(categoryId)) {
    normalized.categoryId = categoryId;
  }

  if ((REQUESTED_PRIORITIES as readonly string[]).includes(query.requestedPriority as string)) {
    normalized.requestedPriority = query.requestedPriority as RequestedPriority;
  }

  if ((TICKET_STATUSES as readonly string[]).includes(query.currentStatus as string)) {
    normalized.currentStatus = query.currentStatus as TicketStatusFilter;
  }

  return normalized;
}
