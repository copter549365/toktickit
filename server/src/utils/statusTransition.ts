/**
 * BR-13 Status Transition Matrix (docs/lab-03/specification.md), the IT Staff / Administrator
 * side only. The Requester's own NEW → CANCELLED path is handled separately by
 * PATCH /api/tickets/:id/cancel (Issue 4) and is not part of this matrix.
 */
export const STAFF_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

export function getPermittedNextStatuses(currentStatus: string): readonly string[] {
  return STAFF_STATUS_TRANSITIONS[currentStatus] ?? [];
}

export function isValidStaffStatusTransition(currentStatus: string, targetStatus: string): boolean {
  return getPermittedNextStatuses(currentStatus).includes(targetStatus);
}

export interface StatusChangeFieldValidation {
  isValid: boolean;
  fieldErrors: Record<string, string>;
  trimmedResolutionSummary?: string;
  trimmedReopenReason?: string;
}

/**
 * Validates the extra fields api-spec.md §4 requires alongside a status transition:
 * `resolutionSummary` (min 5 chars) when moving to RESOLVED or CLOSED, and `reopenReason`
 * (min 5 chars) when moving from RESOLVED to REOPENED.
 */
export function validateStatusChangeFields(
  currentStatus: string,
  targetStatus: string,
  body: { resolutionSummary?: unknown; reopenReason?: unknown },
): StatusChangeFieldValidation {
  const fieldErrors: Record<string, string> = {};
  let trimmedResolutionSummary: string | undefined;
  let trimmedReopenReason: string | undefined;

  if (targetStatus === 'RESOLVED' || targetStatus === 'CLOSED') {
    const raw = typeof body.resolutionSummary === 'string' ? body.resolutionSummary.trim() : '';
    if (raw.length < 5) {
      fieldErrors.resolutionSummary = 'Resolution summary is required and must be at least 5 characters.';
    } else {
      trimmedResolutionSummary = raw;
    }
  }

  if (currentStatus === 'RESOLVED' && targetStatus === 'REOPENED') {
    const raw = typeof body.reopenReason === 'string' ? body.reopenReason.trim() : '';
    if (raw.length < 5) {
      fieldErrors.reopenReason = 'Reopen reason is required and must be at least 5 characters.';
    } else {
      trimmedReopenReason = raw;
    }
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    trimmedResolutionSummary,
    trimmedReopenReason,
  };
}
