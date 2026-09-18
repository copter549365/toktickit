import { API_URL } from './config';
import { ApiError, type ApiErrorResponse } from './tickets';
import type { StaffQueueListParams, StaffQueueListResponse } from '../types/staffTicket';

export { ApiError };

async function parseErrorResponse(response: Response): Promise<ApiErrorResponse> {
  try {
    return await response.json();
  } catch {
    return { error: 'INTERNAL_ERROR' };
  }
}

/** GET /api/staff/tickets (api-spec.md §3, AC-05). Requires role IT_STAFF or ADMINISTRATOR. */
export async function fetchStaffQueue(
  params: StaffQueueListParams = {},
  options?: { signal?: AbortSignal },
): Promise<StaffQueueListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.categoryId) query.set('categoryId', String(params.categoryId));
  if (params.requestedPriority) query.set('requestedPriority', params.requestedPriority);
  if (params.itPriority) query.set('itPriority', params.itPriority);
  if (params.currentStatus) query.set('currentStatus', params.currentStatus);
  if (params.ticketOwnerId !== undefined) query.set('ticketOwnerId', String(params.ticketOwnerId));
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));

  const response = await fetch(`${API_URL}/api/staff/tickets?${query.toString()}`, {
    credentials: 'include',
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}
