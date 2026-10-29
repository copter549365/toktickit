import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Badge } from './Badge';
import { Button } from './Button';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { ActionDrawer } from './ActionDrawer';
import { ActionTakenForm, type ActionFormErrors } from './ActionTakenForm';
import { ApiError } from '../api/tickets';
import { createAction, fetchActions, newClientRequestId } from '../api/actionsTaken';
import { isOpenAction, type ActionTaken, type CreateActionInput } from '../types/actionTaken';
import type { StaffMember } from '../types/staffTicket';
import { clampActionAt, emptyDraft, validateDraft, type ActionDraft } from '../utils/actionDraft';
import { formatBangkokDateTime } from '../utils/bangkokTime';

interface ActionsTakenSectionProps {
  ticketId: number;
  ticketCreatedAt: string;
  /** `requester` renders the list read-only: no Add, Edit, or status controls exist in the DOM (BR-10). */
  mode: 'staff' | 'requester';
  /** The Ticket status allows work (BR-09). */
  writable: boolean;
  staffMembers?: StaffMember[];
  currentUserId?: number;
}

const FAILURE_MESSAGE = 'Something went wrong. Please try again.';
const CLAMP_AT = 140;
const TOAST_MS = 4000;

function ClampedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= CLAMP_AT) return <div className="zg-cell-text">{text}</div>;
  return (
    <div>
      <div className={`zg-cell-text${expanded ? '' : ' zg-clamp-2'}`}>{text}</div>
      <button
        type="button"
        className="btn btn-link btn-sm p-0"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}

function FollowUpPill() {
  return (
    <span className="zg-followup-pill">
      <span aria-hidden="true">⚑</span> Follow-up required
    </span>
  );
}

function isMobileViewport(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767.98px)').matches;
}

/** Actions Taken section of a Ticket Detail screen (docs/lab-04/ui-spec.md §5). */
export function ActionsTakenSection({
  ticketId,
  ticketCreatedAt,
  mode,
  writable,
  staffMembers = [],
  currentUserId,
}: ActionsTakenSectionProps) {
  const canWrite = mode === 'staff' && writable;

  const [actions, setActions] = useState<ActionTaken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<ActionDraft>(() => emptyDraft(currentUserId ?? 0));
  const [defaultActionAt, setDefaultActionAt] = useState('');
  const [createErrors, setCreateErrors] = useState<ActionFormErrors>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const clientRequestId = useRef('');
  const creatingRef = useRef(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [drawer, setDrawer] = useState<{ action: ActionTaken; mode: 'view' | 'edit' } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [focusActionId, setFocusActionId] = useState<number | null>(null);

  const load = useCallback(async (): Promise<ActionTaken[] | null> => {
    try {
      const { data } = await fetchActions(ticketId);
      setActions(data);
      setLoadError(false);
      return data;
    } catch {
      setLoadError(true);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    setIsLoading(true);
    void load().then(() => {
      // ui-spec §10: following the #actions-taken hash (e.g. from My Open Actions) focuses the heading.
      if (window.location.hash === '#actions-taken' && headingRef.current) {
        headingRef.current.focus();
        headingRef.current.scrollIntoView?.({ block: 'start' });
      }
    });
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (createOpen) descriptionRef.current?.focus();
  }, [createOpen]);

  // After a create, focus returns to the new row (ui-spec §5.3).
  useEffect(() => {
    if (focusActionId === null) return;
    const selector = isMobileViewport()
      ? `[data-action-card-id="${focusActionId}"]`
      : `[data-action-id="${focusActionId}"]`;
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.focus();
      setFocusActionId(null);
    }
  }, [focusActionId, actions]);

  const openCreate = () => {
    const fresh = emptyDraft(currentUserId ?? staffMembers[0]?.id ?? 0);
    setDraft(fresh);
    setDefaultActionAt(fresh.actionAt);
    setCreateErrors({});
    setCreateError(null);
    clientRequestId.current = newClientRequestId(); // one id per draft (BR-20)
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    addButtonRef.current?.focus();
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (creatingRef.current) return; // FR-20: one request per click, Enter included

    const errors = validateDraft(draft, { ticketCreatedAt });
    setCreateErrors(errors);
    setCreateError(null);
    if (Object.keys(errors).length > 0) return;

    const input: CreateActionInput = {
      clientRequestId: clientRequestId.current,
      description: draft.description.trim(),
      status: draft.status,
      assigneeId: Number(draft.assigneeId),
      followUpRequired: draft.followUpRequired,
      ...(draft.actionAt !== defaultActionAt ? { actionAt: clampActionAt(draft.actionAt, ticketCreatedAt) } : {}),
      ...(draft.result.trim() ? { result: draft.result.trim() } : {}),
      ...(draft.followUpRequired ? { followUpNote: draft.followUpNote.trim() } : {}),
      ...(draft.attachmentNotes.trim() ? { attachmentNotes: draft.attachmentNotes.trim() } : {}),
    };

    creatingRef.current = true;
    setIsCreating(true);
    try {
      const created = await createAction(ticketId, input);
      setCreateOpen(false);
      setToast('Action added');
      await load();
      setFocusActionId(created.id);
    } catch (error) {
      // FR-21: every typed value stays in the form; the same clientRequestId is reused on retry.
      if (error instanceof ApiError && error.status === 400 && error.data.fieldErrors) {
        setCreateErrors(error.data.fieldErrors as ActionFormErrors);
      } else if (error instanceof ApiError && error.data.error === 'TICKET_NOT_WRITABLE') {
        setCreateError('This ticket is resolved, closed, or cancelled, so actions can no longer be added.');
      } else if (error instanceof ApiError && error.status === 400) {
        setCreateError(error.data.message ?? FAILURE_MESSAGE);
      } else if (error instanceof ApiError && error.status === 403) {
        setCreateError("You don't have permission to add actions to this ticket.");
      } else {
        setCreateError(FAILURE_MESSAGE);
      }
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };

  const reloadAction = async (actionId: number) => {
    const data = await load();
    return data?.find((a) => a.id === actionId) ?? null;
  };

  const rowButtons = (action: ActionTaken, fullWidth = false) => (
    <div className={`d-flex gap-2 ${fullWidth ? 'flex-column' : 'flex-wrap'}`}>
      <button
        type="button"
        className={`btn btn-zg-secondary btn-sm${fullWidth ? ' w-100' : ''}`}
        aria-label={`View action #${action.id}`}
        onClick={() => setDrawer({ action, mode: 'view' })}
      >
        View
      </button>
      {canWrite && isOpenAction(action.status) && (
        <button
          type="button"
          className={`btn btn-zg-primary btn-sm${fullWidth ? ' w-100' : ''}`}
          aria-label={`Edit action #${action.id}`}
          onClick={() => setDrawer({ action, mode: 'edit' })}
        >
          Edit
        </button>
      )}
    </div>
  );

  return (
    <section className="card border-0 shadow-sm mb-4" id="actions-taken" aria-labelledby="actions-taken-heading">
      <div className="card-body p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <h2
              id="actions-taken-heading"
              ref={headingRef}
              tabIndex={-1}
              className="h6 fw-bold mb-0"
              style={{ color: 'var(--color-primary)' }}
            >
              Actions Taken ({actions.length})
            </h2>
            <span className="zg-visibility-tag">
              <span aria-hidden="true">👁</span>
              <span>Visible to Requester</span>
            </span>
          </div>
          {canWrite && !createOpen && (
            <button ref={addButtonRef} type="button" className="btn btn-zg-primary" onClick={openCreate}>
              <span aria-hidden="true">+</span> Add Action
            </button>
          )}
        </div>

        {canWrite && createOpen && (
          <form
            className="card mb-4"
            style={{ borderColor: 'var(--color-field-editable-border)' }}
            aria-label="Add Action"
            onSubmit={handleCreate}
            noValidate
          >
            <div className="card-body">
              <p className="small text-muted">
                Visible to the Requester. Put confidential details in an Internal Note instead.
              </p>
              {createError && (
                <div className="zg-error-banner mb-3" role="alert">
                  {createError}
                </div>
              )}
              <ActionTakenForm
                idPrefix="create-action"
                draft={draft}
                onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                errors={createErrors}
                staffMembers={staffMembers}
                showStatus
                resultRequired={draft.status === 'COMPLETED'}
                disabled={isCreating}
                descriptionRef={descriptionRef}
              />
              <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
                <Button variant="secondary" onClick={closeCreate} disabled={isCreating}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" busy={isCreating} busyLabel="Saving…">
                  Save Action
                </Button>
              </div>
            </div>
          </form>
        )}

        {isLoading && <LoadingState message="Loading actions…" />}
        {!isLoading && loadError && (
          <ErrorState message="Unable to load the actions taken. Please try again." onRetry={() => void load()} />
        )}

        {!isLoading && !loadError && actions.length === 0 && (
          <div className="zg-state-panel">
            <div className="zg-state-panel__message">No actions recorded yet.</div>
            {canWrite && !createOpen && (
              <Button variant="secondary" onClick={openCreate}>
                Add the first action
              </Button>
            )}
          </div>
        )}

        {!isLoading && !loadError && actions.length > 0 && (
          <>
            {/* Desktop and tablet: table (Result and Follow-up merge into Description below 992px). */}
            <div className="d-none d-md-block">
              <table className="table zg-actions-table mb-0">
                <caption className="visually-hidden">Actions taken on this ticket, oldest first</caption>
                <thead>
                  <tr>
                    <th scope="col" className="zg-col-date">Date/Time</th>
                    <th scope="col">Description</th>
                    <th scope="col" className="d-none d-lg-table-cell zg-col-result">Result</th>
                    <th scope="col" className="zg-col-person">Assignee</th>
                    <th scope="col" className="zg-col-person">Performed by</th>
                    <th scope="col" className="zg-col-status">Status</th>
                    <th scope="col" className="d-none d-lg-table-cell zg-col-followup">Follow-up</th>
                    <th scope="col" className="zg-col-buttons">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((action) => (
                    <tr key={action.id} className="zg-action-row" tabIndex={-1} data-action-id={action.id}>
                      <td className="small">{formatBangkokDateTime(action.actionAt)}</td>
                      <td>
                        <ClampedText text={action.description} />
                        <div className="d-lg-none mt-2">
                          {action.result && (
                            <div className="small">
                              <span className="fw-semibold">Result: </span>
                              <span className="zg-cell-text">{action.result}</span>
                            </div>
                          )}
                          {action.followUpRequired && (
                            <div className="mt-1">
                              <FollowUpPill />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="d-none d-lg-table-cell">{action.result ? <ClampedText text={action.result} /> : '—'}</td>
                      <td className="small">{action.assignee.name}</td>
                      <td className="small">{action.performedBy?.name ?? '—'}</td>
                      <td>
                        <Badge kind="actionStatus" value={action.status} />
                      </td>
                      <td className="d-none d-lg-table-cell">{action.followUpRequired ? <FollowUpPill /> : '—'}</td>
                      <td>{rowButtons(action)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards (ui-spec §5.2). */}
            <ul className="d-md-none list-unstyled d-flex flex-column gap-2 mb-0">
              {actions.map((action) => (
                <li
                  key={action.id}
                  className="card zg-action-card p-3"
                  tabIndex={-1}
                  data-action-card-id={action.id}
                >
                  <div className="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">
                    <span className="small text-muted">{formatBangkokDateTime(action.actionAt)}</span>
                    <Badge kind="actionStatus" value={action.status} />
                  </div>
                  <ClampedText text={action.description} />
                  {action.result && (
                    <div className="small mt-1">
                      <span className="fw-semibold">Result: </span>
                      <span className="zg-cell-text">{action.result}</span>
                    </div>
                  )}
                  <div className="small text-muted mt-2">
                    Assignee: {action.assignee.name} · Performed by: {action.performedBy?.name ?? '—'}
                  </div>
                  {action.followUpRequired && (
                    <div className="mt-2">
                      <FollowUpPill />
                    </div>
                  )}
                  <div className="mt-3">{rowButtons(action, true)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {drawer && (
        <ActionDrawer
          key={drawer.action.id}
          ticketId={ticketId}
          ticketCreatedAt={ticketCreatedAt}
          action={drawer.action}
          initialMode={drawer.mode}
          canEdit={canWrite}
          staffMembers={staffMembers}
          onClose={() => setDrawer(null)}
          onSaved={(_updated, message) => {
            setToast(message);
            void load();
          }}
          reloadAction={() => reloadAction(drawer.action.id)}
        />
      )}

      {toast && (
        <div className="zg-toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}

export default ActionsTakenSection;
