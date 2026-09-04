import { API_URL } from './config';
import type { Ticket, CreateTicketInput } from '../types/ticket';
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
