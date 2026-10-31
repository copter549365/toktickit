import { API_URL } from './config';
import { ApiError, type ApiErrorResponse } from './tickets';
import type { RequesterDashboardData, StaffDashboardData } from '../types/dashboard';

async function getDashboard<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include', signal });

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

/** GET /api/dashboard/requester (docs/lab-04/api-spec.md §3). Every value is calculated by the server. */
export function fetchRequesterDashboard(options?: { signal?: AbortSignal }): Promise<RequesterDashboardData> {
  return getDashboard('/api/dashboard/requester', options?.signal);
}

/** GET /api/dashboard/staff (docs/lab-04/api-spec.md §3). Administrators also get `userAccounts`. */
export function fetchStaffDashboard(options?: { signal?: AbortSignal }): Promise<StaffDashboardData> {
  return getDashboard('/api/dashboard/staff', options?.signal);
}
