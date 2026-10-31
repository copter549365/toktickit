import { API_URL } from './config';
import { ApiError, type ApiErrorResponse } from './tickets';
import type { RequesterDashboardData } from '../types/dashboard';

/** GET /api/dashboard/requester (docs/lab-04/api-spec.md §3). Every value is calculated by the server. */
export async function fetchRequesterDashboard(options?: { signal?: AbortSignal }): Promise<RequesterDashboardData> {
  const response = await fetch(`${API_URL}/api/dashboard/requester`, {
    credentials: 'include',
    signal: options?.signal,
  });

  if (!response.ok) {
    let data: ApiErrorResponse = { error: 'INTERNAL_ERROR' };
    try {
      data = await response.json();
    } catch {
      // keep the generic error
    }
    throw new ApiError(response.status, data);
  }

  return response.json();
}
