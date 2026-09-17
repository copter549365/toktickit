import { API_URL } from './config';
import type { Requester } from '../types/requester';

/** GET /api/requesters — active Development Requesters only (api-spec.md §1). */
export async function fetchActiveRequesters(): Promise<Requester[]> {
  const response = await fetch(`${API_URL}/api/requesters`);

  if (!response.ok) {
    throw new Error('Failed to load development requesters');
  }

  return response.json();
}
