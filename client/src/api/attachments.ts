import { API_URL } from './config';
import { ApiError, type ApiErrorResponse } from './tickets';
import type { Attachment } from '../types/attachment';

/**
 * Downloads an active attachment's bytes and triggers a browser save (FR-17). Fetched as a
 * blob (rather than a plain `<a href>`) so a safe-error JSON body can be surfaced instead of
 * navigating the whole page to an error response.
 */
export async function downloadAttachment(attachmentId: number, fileName: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, {
    credentials: 'include',
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

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function removeAttachment(attachmentId: number, removalReason: string): Promise<Attachment> {
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ removalReason }),
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
