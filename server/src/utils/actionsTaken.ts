// Lab 4 Actions Taken rules (docs/lab-04/specification.md BR-03, BR-04, BR-07, BR-20).
// Pure functions so the lifecycle and field rules are unit-tested apart from the routes.

export const ACTION_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

// BR-07: `null` is "create". COMPLETED and CANCELLED are terminal (locked).
const ACTION_TRANSITIONS: Record<ActionStatus | 'CREATE', readonly ActionStatus[]> = {
  CREATE: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'],
  PLANNED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function isActionStatus(value: unknown): value is ActionStatus {
  return typeof value === 'string' && (ACTION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionAction(from: ActionStatus | null, to: unknown): boolean {
  return isActionStatus(to) && ACTION_TRANSITIONS[from ?? 'CREATE'].includes(to);
}

export function isOpenActionStatus(status: ActionStatus): boolean {
  return status === 'PLANNED' || status === 'IN_PROGRESS';
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

// BR-03: actionAt may be at most 5 minutes after the server's now (clock skew allowance).
const ACTION_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** The merged field values of an action (create body, or stored row overlaid with a PATCH body). */
export interface ActionFieldInput {
  actionAt?: unknown;
  description?: unknown;
  result?: unknown;
  status: ActionStatus | string;
  followUpRequired?: unknown;
  followUpNote?: unknown;
  attachmentNotes?: unknown;
  cancelReason?: unknown;
}

export interface ActionFieldValues {
  actionAt: Date;
  description: string;
  result: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  cancelReason: string | null;
}

/** Trims a string; blank or missing becomes null. A non-string is reported as `false`. */
function optionalText(value: unknown): string | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function lengthError(label: string, text: string | null, min: number, max: number, required: boolean): string | null {
  if (text === null) return required ? `${label} is required.` : null;
  if (text.length < min || text.length > max) {
    return min > 0 ? `${label} must be ${min}-${max} characters.` : `${label} must be at most ${max} characters.`;
  }
  return null;
}

export function validateActionFields(
  input: ActionFieldInput,
  ctx: { ticketCreatedAt: Date; now: Date },
): { fieldErrors: Record<string, string>; values: ActionFieldValues } {
  const fieldErrors: Record<string, string> = {};
  const check = (field: string, error: string | null) => {
    if (error) fieldErrors[field] = error;
  };
  const text = (field: string, label: string, value: unknown): string | null => {
    const t = optionalText(value);
    if (t === false) {
      fieldErrors[field] = `${label} must be text.`;
      return null;
    }
    return t;
  };

  let actionAt = ctx.now;
  if (input.actionAt !== undefined && input.actionAt !== null) {
    const parsed =
      input.actionAt instanceof Date ? input.actionAt : typeof input.actionAt === 'string' ? new Date(input.actionAt) : null;
    if (!parsed || isNaN(parsed.getTime())) {
      fieldErrors.actionAt = 'Action time must be a valid date and time.';
    } else if (parsed.getTime() > ctx.now.getTime() + ACTION_AT_FUTURE_TOLERANCE_MS) {
      fieldErrors.actionAt = 'Action time cannot be in the future.';
    } else if (parsed.getTime() < ctx.ticketCreatedAt.getTime()) {
      fieldErrors.actionAt = 'Action time cannot be earlier than when the ticket was created.';
    } else {
      actionAt = parsed;
    }
  }

  const description = text('description', 'Description', input.description);
  if (!fieldErrors.description) check('description', lengthError('Description', description, 5, 2000, true));

  const result = text('result', 'Result', input.result);
  if (!fieldErrors.result) {
    check('result', lengthError('Result', result, input.status === 'COMPLETED' ? 5 : 0, 2000, input.status === 'COMPLETED'));
  }

  let followUpRequired = false;
  if (input.followUpRequired !== undefined && input.followUpRequired !== null) {
    if (typeof input.followUpRequired !== 'boolean') fieldErrors.followUpRequired = 'Follow-up required must be true or false.';
    else followUpRequired = input.followUpRequired;
  }
  // BR-04: the note only exists while follow-up is required.
  let followUpNote: string | null = null;
  if (followUpRequired) {
    followUpNote = text('followUpNote', 'Follow-up note', input.followUpNote);
    if (!fieldErrors.followUpNote) check('followUpNote', lengthError('Follow-up note', followUpNote, 5, 1000, true));
  }

  const attachmentNotes = text('attachmentNotes', 'Attachment notes', input.attachmentNotes);
  if (!fieldErrors.attachmentNotes) check('attachmentNotes', lengthError('Attachment notes', attachmentNotes, 0, 1000, false));

  // BR-07: a cancel reason is recorded only on the transition to CANCELLED.
  let cancelReason: string | null = null;
  if (input.status === 'CANCELLED') {
    cancelReason = text('cancelReason', 'Cancel reason', input.cancelReason);
    if (!fieldErrors.cancelReason) check('cancelReason', lengthError('Cancel reason', cancelReason, 5, 500, true));
  }

  return {
    fieldErrors,
    values: {
      actionAt,
      description: description ?? '',
      result,
      followUpRequired,
      followUpNote,
      attachmentNotes,
      cancelReason,
    },
  };
}
