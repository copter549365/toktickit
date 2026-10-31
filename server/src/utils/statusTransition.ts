/**
 * Final Status Transition Matrix (docs/lab-04/specification.md BR-13, superseding Lab 3 BR-13),
 * IT Staff / Administrator side. The Requester's own NEW → CANCELLED path is handled by
 * PATCH /api/tickets/:id/cancel; `permittedNextStatuses` reports it for the owning Requester.
 */
export const STAFF_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  // Lab 4 D-07 adds REOPENED → WAITING_FOR_REQUESTER.
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

export function getPermittedNextStatuses(currentStatus: string): readonly string[] {
  return STAFF_STATUS_TRANSITIONS[currentStatus] ?? [];
}

export function isValidStaffStatusTransition(currentStatus: string, targetStatus: string): boolean {
  return getPermittedNextStatuses(currentStatus).includes(targetStatus);
}

/**
 * FR-11: the next statuses offered to *this* caller (api-spec §2.1). A Requester may cancel only
 * their own NEW Ticket with no open Actions Taken: they never change actions (D-16).
 */
export function permittedNextStatuses(
  currentStatus: string,
  role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR',
  isOwningRequester: boolean,
  hasOpenActions = false,
): readonly string[] {
  if (role === 'REQUESTER') {
    return isOwningRequester && currentStatus === 'NEW' && !hasOpenActions ? ['CANCELLED'] : [];
  }
  return getPermittedNextStatuses(currentStatus);
}

export type ResolutionConditionKey = 'HAS_OWNER' | 'HAS_COMPLETED_ACTION' | 'NO_OPEN_ACTIONS';

export interface ResolutionGate {
  met: boolean;
  conditions: { key: ResolutionConditionKey; met: boolean; label: string }[];
  warnings: string[];
}

/**
 * BR-14 conditions 1–3 (the summary, condition 4, is a field rule). Follow-up flags on completed
 * actions are warnings, never blockers (D-06).
 */
export function evaluateResolutionGate(
  owner: { isActive: boolean; role: string } | null,
  actions: { status: string; followUpRequired: boolean }[],
): ResolutionGate {
  const conditions: ResolutionGate['conditions'] = [
    {
      key: 'HAS_OWNER',
      met: !!owner && owner.isActive && (owner.role === 'IT_STAFF' || owner.role === 'ADMINISTRATOR'),
      label: 'Ticket has an owner',
    },
    {
      key: 'HAS_COMPLETED_ACTION',
      met: actions.some((a) => a.status === 'COMPLETED'),
      label: 'At least one action is completed',
    },
    {
      key: 'NO_OPEN_ACTIONS',
      met: !actions.some((a) => a.status === 'PLANNED' || a.status === 'IN_PROGRESS'),
      label: 'No planned or in-progress actions remain',
    },
  ];
  const followUps = actions.filter((a) => a.status === 'COMPLETED' && a.followUpRequired).length;
  const warnings =
    followUps === 0
      ? []
      : [`${followUps} completed ${followUps === 1 ? 'action requires' : 'actions require'} follow-up`];
  return { met: conditions.every((c) => c.met), conditions, warnings };
}

export interface StatusChangeFieldValidation {
  isValid: boolean;
  fieldErrors: Record<string, string>;
  trimmedResolutionSummary?: string;
  trimmedReopenReason?: string;
  trimmedNote?: string;
}

/**
 * Validates the extra fields api-spec §2.2 allows alongside a status transition:
 * - `resolutionSummary` (min 5 chars): required for RESOLVED; optional for CLOSED, where the stored
 *   value is kept when it is omitted (Lab 4 change from Lab 3, which required it for CLOSED too);
 * - `reopenReason` (min 5 chars) for RESOLVED → REOPENED;
 * - `note` (max 500 chars), optional for any transition, stored on the history row.
 */
export function validateStatusChangeFields(
  currentStatus: string,
  targetStatus: string,
  body: { resolutionSummary?: unknown; reopenReason?: unknown; note?: unknown },
): StatusChangeFieldValidation {
  const fieldErrors: Record<string, string> = {};
  let trimmedResolutionSummary: string | undefined;
  let trimmedReopenReason: string | undefined;
  let trimmedNote: string | undefined;

  const summaryRequired = targetStatus === 'RESOLVED';
  const summarySent = body.resolutionSummary !== undefined && body.resolutionSummary !== null;
  if (targetStatus === 'RESOLVED' || (targetStatus === 'CLOSED' && summarySent)) {
    const raw = typeof body.resolutionSummary === 'string' ? body.resolutionSummary.trim() : '';
    if (raw.length < 5) {
      fieldErrors.resolutionSummary = summaryRequired
        ? 'Resolution summary is required and must be at least 5 characters.'
        : 'Resolution summary must be at least 5 characters.';
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

  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string' || body.note.trim().length > 500) {
      fieldErrors.note = 'Note must be text of at most 500 characters.';
    } else if (body.note.trim()) {
      trimmedNote = body.note.trim();
    }
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    trimmedResolutionSummary,
    trimmedReopenReason,
    trimmedNote,
  };
}
