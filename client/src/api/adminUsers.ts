import { API_URL } from './config';
import { ApiError, type ApiErrorResponse } from './tickets';
import type { AdminUser, AdminUserListParams, CreateUserInput, UpdateUserInput } from '../types/adminUser';

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

/** GET /api/admin/users (api-spec.md §6, AC-16). Administrator only. */
export async function fetchAdminUsers(params: AdminUserListParams = {}): Promise<AdminUser[]> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.role) query.set('role', params.role);

  const response = await fetch(`${API_URL}/api/admin/users?${query.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

/** POST /api/admin/users (api-spec.md §6, AC-10). */
export async function createAdminUser(input: CreateUserInput): Promise<AdminUser> {
  const response = await fetch(`${API_URL}/api/admin/users`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

/** PATCH /api/admin/users/:id (api-spec.md §6, AC-17). */
export async function updateAdminUser(userId: number, input: UpdateUserInput): Promise<AdminUser> {
  const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  return response.json();
}

/** POST /api/admin/users/:id/reset-password (api-spec.md §6, FR-25). */
export async function resetUserPassword(userId: number, newInitialPassword: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/admin/users/${userId}/reset-password`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ newInitialPassword }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }
}
