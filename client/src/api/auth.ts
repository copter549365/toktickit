import { API_URL } from './config';
import type { AuthUser } from '../types/user';

export interface ApiErrorResponse {
  error: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  data: ApiErrorResponse;

  constructor(status: number, data: ApiErrorResponse) {
    super(data.message || data.error || `HTTP error ${status}`);
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

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  const data = await response.json();
  return data.user;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  const data = await response.json();
  return data.user;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/auth/change-password`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorResponse(response));
  }

  const data = await response.json();
  return data.user;
}
