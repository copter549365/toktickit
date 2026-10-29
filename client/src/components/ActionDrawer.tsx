import { useRef, useState, type ReactNode } from 'react';
import { Badge } from './Badge';
import { Button } from './Button';
import { Drawer } from './Drawer';
import { FormField } from './FormField';
import { Modal } from './Modal';
import { ActionTakenForm, type ActionFormErrors } from './ActionTakenForm';
import { ApiError } from '../api/tickets';
import { updateAction } from '../api/actionsTaken';
import { isOpenAction, type ActionTaken, type UpdateActionInput } from '../types/actionTaken';
import type { StaffMember } from '../types/staffTicket';
import { diffDraft, draftFromAction, validateDraft, type ActionDraft } from '../utils/actionDraft';
import { formatBangkokDateTime } from '../utils/bangkokTime';

type BusyKind = 'save' | 'start' | 'complete' | 'cancel';

interface ActionDrawerProps {
  ticketId: number;
  ticketCreatedAt: string;
  action: ActionTaken;
  initialMode: 'view' | 'edit';
  /** Staff on a writable Ticket (BR-09); a Requester never gets edit controls (BR-10). */
  canEdit: boolean;
  staffMembers: StaffMember[];
  onClose: () => void;
  onSaved: (updated: ActionTaken, message: string) => void;
  /** Re-fetches the list and returns the latest copy of this action. */
  reloadAction: () => Promise<ActionTaken | null>;
}

const FAILURE_MESSAGE = 'Something went wrong. Please try again.';
const CONFLICT_CODES = ['STALE_UPDATE', 'ACTION_LOCKED'];

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="zg-field">
      <div className="zg-label">{label}</div>
      <div className="field-readonly zg-readonly-value">{children}</div>
    </div>
  );
}

function ActionDetails({ action }: { action: ActionTaken }) {
  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <Badge kind="actionStatus" value={action.status} />
        {action.followUpRequired && (
          <span className="zg-followup-pill ms-2">
            <span aria-hidden="true">⚑</span> Follow-up required
          </span>
        )}
      </div>
      <ReadOnlyField label="Action date and time (Bangkok time)">{formatBangkokDateTime(action.actionAt)}</ReadOnlyField>
      <ReadOnlyField label="Description">{action.description}</ReadOnlyField>
      <ReadOnlyField label="Result">{action.result ?? '—'}</ReadOnlyField>
      <ReadOnlyField label="Assignee">{action.assignee.name}</ReadOnlyField>
      <ReadOnlyField label="Performed by">{action.performedBy?.name ?? 'Set automatically when completed'}</ReadOnlyField>
      {action.followUpRequired && <ReadOnlyField label="Follow-up Note">{action.followUpNote}</ReadOnlyField>}
      <ReadOnlyField label="Attachment Notes">{action.attachmentNotes ?? '—'}</ReadOnlyField>
      <ReadOnlyField label="Created by">
        {action.createdBy.name}, {formatBangkokDateTime(action.createdAt)}
      </ReadOnlyField>
      <ReadOnlyField label="Last updated by">
        {action.lastUpdatedBy.name}, {formatBangkokDateTime(action.updatedAt)}
      </ReadOnlyField>
      {action.completedAt && <ReadOnlyField label="Completed at">{formatBangkokDateTime(action.completedAt)}</ReadOnlyField>}
      {action.cancelReason && <ReadOnlyField label="Cancel reason">{action.cancelReason}</ReadOnlyField>}
    </div>
  );
}

/** View and edit drawer for one Action Taken (docs/lab-04/ui-spec.md §5.4). */
export function ActionDrawer({
  ticketId,
  ticketCreatedAt,
  action,
  initialMode,
  canEdit,
  staffMembers,
  onClose,
  onSaved,
  reloadAction,
}: ActionDrawerProps) {
  const [current, setCurrent] = useState(action);
  const [editing, setEditing] = useState(initialMode === 'edit' && canEdit && isOpenAction(action.status));
  const [draft, setDraft] = useState<ActionDraft>(() => draftFromAction(action));
  const [errors, setErrors] = useState<ActionFormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKind | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<ActionTaken | null>(null);
  const [reloading, setReloading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const cancelReasonRef = useRef<HTMLTextAreaElement>(null);

  const editable = canEdit && isOpenAction(current.status);
  const inactiveAssignee = staffMembers.some((m) => m.id === current.assignee.id) ? null : current.assignee;

  async function send(kind: BusyKind, body: UpdateActionInput, message: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(kind);
    setGeneralError(null);
    try {
      const updated = await updateAction(ticketId, current.id, body);
      setCurrent(updated);
      setDraft(draftFromAction(updated));
      setEditing(false);
      setConflict(false);
      setLatest(null);
      setConfirmComplete(false);
      onSaved(updated, message);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && CONFLICT_CODES.includes(error.data.error)) {
        setConflict(true);
      } else if (error instanceof ApiError && error.status === 400 && error.data.fieldErrors) {
        setErrors(error.data.fieldErrors as ActionFormErrors);
      } else if (error instanceof ApiError && error.data.error === 'TICKET_NOT_WRITABLE') {
        setGeneralError('This ticket is resolved, closed, or cancelled, so its actions can no longer be changed.');
      } else if (error instanceof ApiError && error.data.error === 'INVALID_ACTION_TRANSITION') {
        setGeneralError('That status change is not allowed for this action. Reload to see its current status.');
      } else {
        setGeneralError(FAILURE_MESSAGE);
      }
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function validate(requireResult = false): boolean {
    const next = validateDraft(draft, { ticketCreatedAt, requireResult });
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const changes = () => diffDraft(current, draft, ticketCreatedAt);

  const handleSave = () => {
    setConfirmComplete(false);
    if (!validate()) return;
    const diff = changes();
    if (Object.keys(diff).length === 0) {
      setEditing(false);
      return;
    }
    void send('save', { expectedVersion: current.version, ...diff }, 'Action updated');
  };

  const handleStart = () => {
    setConfirmComplete(false);
    if (!validate()) return;
    void send('start', { expectedVersion: current.version, ...changes(), status: 'IN_PROGRESS' }, 'Action started');
  };

  const handleMarkCompleted = () => {
    if (!validate(true)) return;
    setConfirmComplete(true);
  };

  const handleConfirmCompletion = () => {
    if (!validate(true)) return;
    void send('complete', { expectedVersion: current.version, ...changes(), status: 'COMPLETED' }, 'Action completed');
  };

  const handleConfirmCancel = async () => {
    const reason = cancelReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setCancelError('Cancel reason must be 5-500 characters.');
      return;
    }
    setCancelError(null);
    await send('cancel', { expectedVersion: current.version, status: 'CANCELLED', cancelReason: reason }, 'Action cancelled');
    // On failure the modal also closes, so the conflict or error banner in the drawer is visible.
    setCancelOpen(false);
  };

  const stopEditing = () => {
    setDraft(draftFromAction(current));
    setErrors({});
    setConfirmComplete(false);
    setLatest(null);
    setEditing(false);
  };

  const handleReloadLatest = async () => {
    setReloading(true);
    try {
      const fresh = await reloadAction();
      if (!fresh) {
        setGeneralError(FAILURE_MESSAGE);
        return;
      }
      setCurrent(fresh);
      setLatest(fresh);
      setConflict(false);
      if (!isOpenAction(fresh.status)) setEditing(false);
    } finally {
      setReloading(false);
    }
  };

  const handleDiscard = async () => {
    setReloading(true);
    try {
      const fresh = (await reloadAction()) ?? current;
      setCurrent(fresh);
      setDraft(draftFromAction(fresh));
      setErrors({});
      setConflict(false);
      setLatest(null);
      setEditing(false);
    } finally {
      setReloading(false);
    }
  };

  const startEditing = () => {
    setDraft(draftFromAction(current));
    setErrors({});
    setGeneralError(null);
    setEditing(true);
  };

  return (
    <>
      <Drawer title={`Action #${current.id}`} onClose={onClose}>
        {conflict && (
          <div className="zg-conflict-banner mb-3" role="alert">
            <div className="fw-semibold mb-2">Someone else updated this action. Your changes are kept below.</div>
            <div className="d-flex flex-wrap gap-2">
              <Button variant="primary" onClick={handleReloadLatest} busy={reloading} busyLabel="Reloading…">
                Reload latest
              </Button>
              <Button variant="secondary" onClick={handleDiscard} disabled={reloading}>
                Discard my changes
              </Button>
            </div>
          </div>
        )}

        {generalError && (
          <div className="zg-error-banner mb-3" role="alert">
            {generalError}
          </div>
        )}

        {!editing && (
          <>
            <ActionDetails action={current} />
            <div className="mt-4">
              {editable && (
                <Button variant="primary" onClick={startEditing}>
                  Edit
                </Button>
              )}
              {!isOpenAction(current.status) && (
                <div className="text-muted small">
                  <p className="fw-semibold mb-1">
                    {current.status === 'COMPLETED' ? 'Completed actions are read-only' : 'Cancelled actions are read-only'}
                  </p>
                  <p className="mb-0">To correct it, record a new action that refers to this one.</p>
                </div>
              )}
            </div>
          </>
        )}

        {editing && (
          <>
            {latest && (
              <section className="zg-conflict-banner mb-3" aria-label="Latest saved version">
                <div className="fw-semibold mb-2">Latest saved version (version {latest.version})</div>
                <ActionDetails action={latest} />
              </section>
            )}
            <ActionTakenForm
              idPrefix="edit-action"
              draft={draft}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              errors={errors}
              staffMembers={staffMembers}
              showStatus={false}
              resultRequired={confirmComplete}
              disabled={busy !== null}
              inactiveAssignee={inactiveAssignee}
            />

            {confirmComplete && (
              <div className="zg-resolution-banner mt-3" role="group" aria-label="Confirm completion">
                <p className="mb-2">Mark this action as completed? Performed by will be set to you.</p>
                <div className="d-flex flex-wrap gap-2">
                  <Button variant="primary" onClick={handleConfirmCompletion} busy={busy === 'complete'} busyLabel="Saving…">
                    Confirm Completion
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmComplete(false)} disabled={busy !== null}>
                    Back
                  </Button>
                </div>
              </div>
            )}

            <div className="d-flex flex-wrap gap-2 mt-4">
              <Button variant="primary" onClick={handleSave} busy={busy === 'save'} busyLabel="Saving…" disabled={busy !== null}>
                Save Changes
              </Button>
              {current.status === 'PLANNED' && (
                <Button variant="secondary" onClick={handleStart} busy={busy === 'start'} busyLabel="Starting…" disabled={busy !== null}>
                  Start
                </Button>
              )}
              {!confirmComplete && (
                <Button variant="secondary" onClick={handleMarkCompleted} disabled={busy !== null}>
                  Mark Completed
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={() => {
                  setCancelReason('');
                  setCancelError(null);
                  setCancelOpen(true);
                }}
                disabled={busy !== null}
              >
                Cancel Action
              </Button>
              <Button variant="tertiary" onClick={stopEditing} disabled={busy !== null}>
                Stop editing
              </Button>
            </div>
          </>
        )}
      </Drawer>

      {cancelOpen && (
        <Modal title="Cancel Action" onClose={() => setCancelOpen(false)} initialFocusRef={cancelReasonRef}>
          <p className="small text-muted">
            Cancelled actions stay on the ticket as a record and can no longer be edited. The reason is visible to the
            Requester.
          </p>
          <FormField htmlFor="cancel-reason" label="Reason for cancelling" required error={cancelError}>
            <textarea
              ref={cancelReasonRef}
              id="cancel-reason"
              className={`form-control field-editable${cancelError ? ' field-invalid' : ''}`}
              rows={3}
              maxLength={500}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              aria-invalid={!!cancelError || undefined}
              aria-describedby={cancelError ? 'cancel-reason-error' : undefined}
              disabled={busy === 'cancel'}
            />
          </FormField>
          <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={busy === 'cancel'}>
              Keep Action
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} busy={busy === 'cancel'} busyLabel="Cancelling…">
              Confirm Cancel
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default ActionDrawer;
