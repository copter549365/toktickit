import { API_URL } from './config';
import type {
  Ticket,
  TicketDetail,
  CreateTicketInput,
  TicketListParams,
  TicketListResponse,
} from '../types/ticket';
import type { Attachment } from '../types/attachment';
import type { PublicComment } from '../types/comment';

export interface ApiErrorResponse {
  error: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  field?: string;
}

export class ApiError extends Error {
  status: number;
  data: ApiErrorResponse;

  constructor(status: number, data: ApiErrorResponse) {
    super(data.error || `HTTP error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Mutating requests carry X-Requested-With so the server's CSRF defense-in-depth check
// (api-spec.md §0.1.3) can tell them apart from a plain HTML form submission.
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

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const response = await fetch(`${API_URL}/api/tickets`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  const data = await response.json();
  return data.ticket;
}

export async function fetchMyTickets(
  params: TicketListParams = {},
  options?: { signal?: AbortSignal },
): Promise<TicketListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.categoryId) query.set('categoryId', String(params.categoryId));
  if (params.requestedPriority) query.set('requestedPriority', params.requestedPriority);
  if (params.currentStatus) query.set('currentStatus', params.currentStatus);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));

  const response = await fetch(`${API_URL}/api/tickets?${query.toString()}`, {
    credentials: 'include',
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

export async function fetchTicketById(
  ticketId: number,
  options?: { signal?: AbortSignal },
): Promise<TicketDetail> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}`, {
    credentials: 'include',
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

export async function uploadTicketAttachment(ticketId: number, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

/** PATCH /api/tickets/:id/resolve-indicator (ui-spec.md §5.4, FR-13, BR-06). */
export async function markProblemAppearsResolved(ticketId: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/resolve-indicator`, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ appearsResolved: true }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }
}

/** PATCH /api/tickets/:id/cancel (ui-spec.md §5.4, FR-13.1). */
export async function cancelTicket(ticketId: number, cancellationReason: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/cancel`, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ cancellationReason }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }
}

/** GET /api/tickets/:id/comments (ui-spec.md §5.4, BR-04). */
export async function fetchComments(ticketId: number): Promise<PublicComment[]> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

/** POST /api/tickets/:id/comments (ui-spec.md §5.4, BR-04, BR-14, BR-15). */
export async function postComment(ticketId: number, content: string): Promise<PublicComment> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}
