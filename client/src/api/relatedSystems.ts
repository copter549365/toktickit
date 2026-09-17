import { API_URL } from './config';
import type { RelatedSystem } from '../types/relatedSystem';

export async function fetchActiveRelatedSystems(): Promise<RelatedSystem[]> {
  const response = await fetch(`${API_URL}/api/related-systems`);
  if (!response.ok) {
    throw new Error('Failed to fetch related systems');
  }
  return response.json();
}
