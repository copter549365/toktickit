import { API_URL } from './config';
import { ApiError, type ApiErrorResponse } from './tickets';
import type {
  StaffMember,
  StaffQueueListParams,
  StaffQueueListResponse,
  StaffTicketDetailData,
} from '../types/staffTicket';
import type { Priority, TicketStatus } from '../types/ticket';

export { ApiError };

const JSON_REQUEST_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
};

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

/** GET /api/staff/tickets/:id (api-spec.md §4). Full operational payload. */
export async function fetchStaffTicketById(
  ticketId: number,
  options?: { signal?: AbortSignal },
): Promise<StaffTicketDetailData> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}`, {
    credentials: 'include',
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

/** GET /api/staff/users — active IT Staff/Administrators for the owner dropdown. */
export async function fetchStaffMembers(): Promise<StaffMember[]> {
  const response = await fetch(`${API_URL}/api/staff/users`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

/** PATCH /api/staff/tickets/:id/owner (claim/reassign/unassign). */
export async function updateTicketOwner(
  ticketId: number,
  ticketOwnerId: number | null,
): Promise<{ id: number; ticketOwnerId: number | null; owner: StaffMember | null }> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/owner`, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ ticketOwnerId }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

/** PATCH /api/staff/tickets/:id/priority. */
export async function updateItPriority(ticketId: number, itPriority: Priority): Promise<void> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/priority`, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ itPriority }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }
}

/** PATCH /api/staff/tickets/:id/status (BR-13). */
export async function updateTicketStatus(
  ticketId: number,
  status: TicketStatus,
  extra: { resolutionSummary?: string; reopenReason?: string } = {},
): Promise<{ id: number; currentStatus: TicketStatus; resolutionSummary: string | null; reopenReason: string | null }> {
  const response = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ status, ...extra }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}
