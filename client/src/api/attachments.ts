import { API_URL } from './config';
import { ApiError, type ApiErrorResponse } from './tickets';
import type { Attachment } from '../types/attachment';

/**
 * Downloads an active attachment's bytes and triggers a browser save (FR-17). A plain `<a href>`
 * cannot carry the `x-requester-id` header the API requires, so the file is fetched as a blob and
 * saved via a temporary object URL instead.
 */
export async function downloadAttachment(
  requesterId: number,
  attachmentId: number,
  fileName: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, {
    headers: {
      'x-requester-id': String(requesterId),
    },
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

export async function removeAttachment(
  requesterId: number,
  attachmentId: number,
  removalReason: string,
): Promise<Attachment> {
  const response = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'x-requester-id': String(requesterId),
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
