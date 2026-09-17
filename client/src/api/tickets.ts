import { API_URL } from './config';
import type {
  Ticket,
  TicketDetail,
  CreateTicketInput,
  TicketListParams,
  TicketListResponse,
} from '../types/ticket';
import type { Attachment } from '../types/attachment';

export interface ApiErrorResponse {
  error: string;
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

export async function createTicket(
  requesterId: number,
  input: CreateTicketInput,
): Promise<Ticket> {
  const response = await fetch(`${API_URL}/api/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-requester-id': String(requesterId),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: 'INTERNAL_ERROR' };
    }
    throw new ApiError(response.status, errorData);
  }

  return response.json();
}

export async function fetchMyTickets(
  requesterId: number,
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
    headers: {
      'x-requester-id': String(requesterId),
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: 'INTERNAL_ERROR' };
    }
    throw new ApiError(response.status, errorData);
  }

  return response.json();
}

export async function fetchTicketById(
  requesterId: number,
  ticketId: number,
  options?: { signal?: AbortSignal },
): Promise<TicketDetail> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}`, {
    headers: {
      'x-requester-id': String(requesterId),
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: 'INTERNAL_ERROR' };
    }
    throw new ApiError(response.status, errorData);
  }

  return response.json();
}

export async function uploadTicketAttachment(
  requesterId: number,
  ticketId: number,
  file: File,
): Promise<Attachment> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    headers: {
      'x-requester-id': String(requesterId),
    },
    body: formData,
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: 'INTERNAL_ERROR' };
    }
    throw new ApiError(response.status, errorData);
  }

  return response.json();
}
