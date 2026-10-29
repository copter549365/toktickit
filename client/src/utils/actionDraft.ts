import type { ActionTaken, UpdateActionInput } from '../types/actionTaken';
import { fromBangkokInputValue, toBangkokInputValue } from './bangkokTime';

// Client-side mirror of docs/lab-04/specification.md BR-03/BR-04. The server stays the authority;
// these messages match its wording so inline errors read the same either way.

export type DraftStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ActionDraft {
  actionAt: string; // datetime-local value in Bangkok time
  description: string;
  status: DraftStatus;
  result: string;
  assigneeId: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

export type DraftErrors = Partial<Record<keyof ActionDraft | 'cancelReason', string>>;

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function emptyDraft(assigneeId: number, now = new Date()): ActionDraft {
  return {
    actionAt: toBangkokInputValue(now),
    description: '',
    status: 'PLANNED',
    result: '',
    assigneeId: String(assigneeId),
    followUpRequired: false,
    followUpNote: '',
    attachmentNotes: '',
  };
}

export function draftFromAction(action: ActionTaken): ActionDraft {
  return {
    actionAt: toBangkokInputValue(action.actionAt),
    description: action.description,
    status: action.status === 'CANCELLED' ? 'PLANNED' : action.status,
    result: action.result ?? '',
    assigneeId: String(action.assignee.id),
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote ?? '',
    attachmentNotes: action.attachmentNotes ?? '',
  };
}

function lengthError(label: string, value: string, min: number, max: number): string | undefined {
  const length = value.trim().length;
  if (length < min || length > max) return `${label} must be ${min}-${max} characters.`;
  return undefined;
}

export function validateDraft(
  draft: ActionDraft,
  ctx: { ticketCreatedAt: string; now?: Date; requireResult?: boolean },
): DraftErrors {
  const errors: DraftErrors = {};
  const now = ctx.now ?? new Date();

  const actionAt = fromBangkokInputValue(draft.actionAt);
  if (!actionAt) {
    errors.actionAt = 'Action time must be a valid date and time.';
  } else if (new Date(actionAt).getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    errors.actionAt = 'Action time cannot be in the future.';
  } else if (draft.actionAt < toBangkokInputValue(ctx.ticketCreatedAt)) {
    // Minute precision: the creation minute itself is allowed (see clampActionAt).
    errors.actionAt = 'Action time cannot be earlier than when the ticket was created.';
  }

  const description = lengthError('Description', draft.description, 5, 2000);
  if (description) errors.description = description;

  if (draft.status === 'COMPLETED' || ctx.requireResult) {
    const result = lengthError('Result', draft.result, 5, 2000);
    if (result) errors.result = result;
  } else if (draft.result.trim().length > 2000) {
    errors.result = 'Result must be at most 2000 characters.';
  }

  if (draft.followUpRequired) {
    const note = lengthError('Follow-up note', draft.followUpNote, 5, 1000);
    if (note) errors.followUpNote = note;
  }

  if (draft.attachmentNotes.trim().length > 1000) {
    errors.attachmentNotes = 'Attachment notes must be at most 1000 characters.';
  }

  return errors;
}

/** The datetime-local value as an ISO instant, never earlier than the ticket's creation. */
export function clampActionAt(value: string, ticketCreatedAt: string): string {
  const iso = fromBangkokInputValue(value)!;
  return new Date(iso) < new Date(ticketCreatedAt) ? new Date(ticketCreatedAt).toISOString() : iso;
}

const trimmedOrNull = (value: string) => value.trim() || null;

/** Only the fields the user actually changed, so a PATCH never rewrites what someone else edited. */
export function diffDraft(
  action: ActionTaken,
  draft: ActionDraft,
  ticketCreatedAt: string,
): Omit<UpdateActionInput, 'expectedVersion'> {
  const before = draftFromAction(action);
  const changes: Omit<UpdateActionInput, 'expectedVersion'> = {};
  if (draft.actionAt !== before.actionAt) changes.actionAt = clampActionAt(draft.actionAt, ticketCreatedAt);
  if (draft.description.trim() !== before.description.trim()) changes.description = draft.description.trim();
  if (draft.result.trim() !== before.result.trim()) changes.result = trimmedOrNull(draft.result);
  if (draft.assigneeId !== before.assigneeId) changes.assigneeId = Number(draft.assigneeId);
  if (draft.followUpRequired !== before.followUpRequired) changes.followUpRequired = draft.followUpRequired;
  if (draft.followUpRequired && draft.followUpNote.trim() !== before.followUpNote.trim()) {
    changes.followUpNote = draft.followUpNote.trim();
  }
  if (draft.attachmentNotes.trim() !== before.attachmentNotes.trim()) {
    changes.attachmentNotes = trimmedOrNull(draft.attachmentNotes);
  }
  return changes;
}
