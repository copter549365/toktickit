import { API_URL } from './config';
import { ApiError, type ApiErrorResponse } from './tickets';
import type { ActionListResponse, ActionTaken, CreateActionInput, UpdateActionInput } from '../types/actionTaken';

const JSON_REQUEST_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
};

async function parseErrorResponse(response: Response): Promise<ApiErrorResponse & { currentVersion?: number }> {
  try {
    return await response.json();
  } catch {
    return { error: 'INTERNAL_ERROR' };
  }
}

/** One UUID v4 per create draft (BR-20); falls back where `crypto.randomUUID` is unavailable. */
export function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** GET /api/tickets/:id/actions (docs/lab-04/api-spec.md §1). Requester (own ticket), IT Staff, Admin. */
export async function fetchActions(ticketId: number, options?: { signal?: AbortSignal }): Promise<ActionListResponse> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/actions`, {
    credentials: 'include',
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  const body = await response.json();
  return {
    data: Array.isArray(body?.data) ? body.data : [],
    meta: body?.meta ?? { totalCount: 0, openCount: 0, completedCount: 0 },
  };
}

/** POST /api/tickets/:id/actions. Idempotent on `clientRequestId` (BR-20): 201 new, 200 replay. */
export async function createAction(ticketId: number, input: CreateActionInput): Promise<ActionTaken> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/actions`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return (await response.json()).data;
}

/** PATCH /api/tickets/:id/actions/:actionId. `expectedVersion` is required (BR-18). */
export async function updateAction(ticketId: number, actionId: number, input: UpdateActionInput): Promise<ActionTaken> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/actions/${actionId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return (await response.json()).data;
}
