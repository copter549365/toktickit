import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchStaffTicketById,
  fetchStaffMembers,
  updateTicketOwner,
  updateItPriority,
  updateTicketStatus,
  ApiError,
} from '../api/staffTickets';
import { fetchComments, postComment, fetchNotes, postNote } from '../api/tickets';
import { downloadAttachment } from '../api/attachments';
import { Badge, RequesterSaysResolvedPill } from '../components/Badge';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { ActionsTakenSection } from '../components/ActionsTakenSection';
import { Modal } from '../components/Modal';
import { StatusHistory } from '../components/StatusHistory';
import { ACTION_WRITABLE_TICKET_STATUSES } from '../types/actionTaken';
import { formatDate } from '../utils/formatDate';
import { formatBytes } from '../utils/attachmentValidation';
import type { PublicComment, InternalNote } from '../types/comment';
import type { StaffMember, StaffTicketDetailData } from '../types/staffTicket';
import type { Priority, ResolutionConditionKey, ResolutionGate, TicketStatus } from '../types/ticket';

const STALE_TICKET_MESSAGE = 'This ticket was changed by someone else. Reload to see the latest version.';
const TOAST_MS = 4000;

function isStale(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.data.error === 'STALE_UPDATE';
}

const MAX_MESSAGE_LENGTH = 2000;
const CONFIRM_REQUIRED_STATUSES: TicketStatus[] = ['RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'];

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

export function StaffTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const ticketId = Number(id);
  const isValidId = Number.isInteger(ticketId) && ticketId > 0;

  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);

  // Owner control
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [isSavingOwner, setIsSavingOwner] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  // IT Priority control
  const [selectedPriority, setSelectedPriority] = useState<Priority>('MEDIUM');
  const [isSavingPriority, setIsSavingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);

  // Status workflow control
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [resolutionSummaryInput, setResolutionSummaryInput] = useState('');
  const [reopenReasonInput, setReopenReasonInput] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Lab 4 workflow feedback (docs/lab-04/ui-spec.md §6, §8)
  const [isStaleTicket, setIsStaleTicket] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  /** The gate as last reported by a 409, until the ticket is re-fetched (ui-spec §6.2). */
  const [gateFromServer, setGateFromServer] = useState<ResolutionGate | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [workflowRefresh, setWorkflowRefresh] = useState(0);

  // Public Comments
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [postCommentError, setPostCommentError] = useState<string | null>(null);

  // Internal Notes
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [isPostingNote, setIsPostingNote] = useState(false);
  const [postNoteError, setPostNoteError] = useState<string | null>(null);

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!isValidId) return undefined;

    setIsLoading(true);
    setLoadError(null);
    setNotFound(false);

    const controller = new AbortController();
    fetchStaffTicketById(ticketId, { signal: controller.signal })
      .then((data) => {
        setTicket(data);
        setSelectedOwnerId(data.ticketOwnerId ? String(data.ticketOwnerId) : '');
        setSelectedPriority(data.itPriority ?? 'MEDIUM');
        setSelectedStatus('');
        setIsLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setLoadError('Unable to load this ticket. Please try again.');
        }
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [ticketId, isValidId]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load, retryCount]);

  /** Re-fetches the ticket in place after a mutation, without the full-page loading state (ui-spec §6.3). */
  const refreshTicket = useCallback(async () => {
    const data = await fetchStaffTicketById(ticketId);
    setTicket(data);
    setSelectedOwnerId(data.ticketOwnerId ? String(data.ticketOwnerId) : '');
    setSelectedPriority(data.itPriority ?? 'MEDIUM');
    setGateFromServer(null);
    return data;
  }, [ticketId]);

  const handleReloadLatest = async () => {
    setIsReloading(true);
    try {
      await refreshTicket();
      setIsStaleTicket(false);
      setStatusError(null);
      setOwnerError(null);
      setPriorityError(null);
    } catch {
      setStatusError('Unable to reload this ticket. Please try again.');
    } finally {
      setIsReloading(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    fetchStaffMembers()
      .then(setStaffMembers)
      .catch(() => setStaffMembers([]));
  }, []);

  const loadComments = useCallback(() => {
    if (!isValidId) return undefined;
    setCommentsLoading(true);
    setCommentsError(null);
    fetchComments(ticketId)
      .then((data) => {
        setComments(data);
        setCommentsLoading(false);
      })
      .catch(() => {
        setCommentsError('Unable to load comments. Please try again.');
        setCommentsLoading(false);
      });
  }, [ticketId, isValidId]);

  const loadNotes = useCallback(() => {
    if (!isValidId) return undefined;
    setNotesLoading(true);
    setNotesError(null);
    fetchNotes(ticketId)
      .then((data) => {
        setNotes(data);
        setNotesLoading(false);
      })
      .catch(() => {
        setNotesError('Unable to load internal notes. Please try again.');
        setNotesLoading(false);
      });
  }, [ticketId, isValidId]);

  useEffect(() => {
    if (!ticket) return;
    loadComments();
    loadNotes();
    // Only re-fetch when the ticket itself first resolves — posting appends locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(ticket)]);

  const handleClaim = async () => {
    if (!user) return;
    setIsSavingOwner(true);
    setOwnerError(null);
    try {
      await updateTicketOwner(ticketId, user.id, ticket?.version);
      await refreshTicket();
    } catch (err) {
      if (isStale(err)) setIsStaleTicket(true);
      else setOwnerError('Unable to claim this ticket right now. Please try again.');
    } finally {
      setIsSavingOwner(false);
    }
  };

  const handleSaveOwner = async () => {
    setIsSavingOwner(true);
    setOwnerError(null);
    try {
      const ticketOwnerId = selectedOwnerId ? Number(selectedOwnerId) : null;
      await updateTicketOwner(ticketId, ticketOwnerId, ticket?.version);
      await refreshTicket();
    } catch (err) {
      if (isStale(err)) {
        setIsStaleTicket(true);
      } else if (err instanceof ApiError && err.data.error === 'INVALID_TICKET_OWNER') {
        setOwnerError('That user is not an active IT Staff member or Administrator.');
      } else {
        setOwnerError('Unable to update the ticket owner right now. Please try again.');
      }
    } finally {
      setIsSavingOwner(false);
    }
  };

  const handleSavePriority = async () => {
    setIsSavingPriority(true);
    setPriorityError(null);
    try {
      await updateItPriority(ticketId, selectedPriority, ticket?.version);
      await refreshTicket();
    } catch (err) {
      if (isStale(err)) setIsStaleTicket(true);
      else setPriorityError('Unable to update IT Priority right now. Please try again.');
    } finally {
      setIsSavingPriority(false);
    }
  };

  const handleStatusSelect = (value: string) => {
    setSelectedStatus(value);
    setStatusError(null);
    setResolutionSummaryInput('');
    setReopenReasonInput('');
    setShowStatusConfirm(false);
    setGateFromServer(null);
  };

  const handleSaveStatusClick = async () => {
    if (!selectedStatus) return;
    if (CONFIRM_REQUIRED_STATUSES.includes(selectedStatus as TicketStatus)) {
      // The checklist must reflect actions added or completed since the page loaded (BR-14), and
      // the Actions Taken list is refreshed with it so both agree.
      if (selectedStatus === 'RESOLVED') {
        await refreshTicket().catch(() => undefined);
        setWorkflowRefresh((n) => n + 1);
      }
      setShowStatusConfirm(true);
      return;
    }
    void applyStatusChange();
  };

  const applyStatusChange = async () => {
    if (!ticket || !selectedStatus) return;

    // Lab 4 api-spec §2.2: a summary is required for RESOLVED and optional for CLOSED.
    const summary = resolutionSummaryInput.trim();
    const needsReopenReason = ticket.currentStatus === 'RESOLVED' && selectedStatus === 'REOPENED';
    const sendsSummary = selectedStatus === 'RESOLVED' || (selectedStatus === 'CLOSED' && summary.length > 0);

    if (sendsSummary && summary.length < 5) {
      setStatusError('Resolution summary must be at least 5 characters.');
      return;
    }
    if (needsReopenReason && reopenReasonInput.trim().length < 5) {
      setStatusError('Reopen reason must be at least 5 characters.');
      return;
    }

    setIsSavingStatus(true);
    setStatusError(null);
    try {
      await updateTicketStatus(ticketId, selectedStatus as TicketStatus, {
        resolutionSummary: sendsSummary ? summary : undefined,
        reopenReason: needsReopenReason ? reopenReasonInput.trim() : undefined,
        expectedVersion: ticket.version,
      });
      setShowStatusConfirm(false);
      setToast(`Status changed to ${STATUS_LABEL[selectedStatus as TicketStatus]}`);
      setSelectedStatus('');
      setResolutionSummaryInput('');
      setReopenReasonInput('');
      // ui-spec §6.3: badge, permitted list, history and (auto-cancelled) actions refresh in place.
      setWorkflowRefresh((n) => n + 1);
      await refreshTicket().catch(() => setRetryCount((c) => c + 1));
    } catch (err) {
      if (isStale(err)) {
        setIsStaleTicket(true);
      } else if (err instanceof ApiError && err.data.error === 'RESOLUTION_GATE_NOT_MET') {
        // Refresh the checklist from the error body; the summary stays typed (ui-spec §6.2).
        const unmet = new Set(
          ((err.data as { unmetConditions?: { key: ResolutionConditionKey }[] }).unmetConditions ?? []).map((c) => c.key),
        );
        const base = ticket.resolutionGate;
        if (base) {
          setGateFromServer({
            ...base,
            met: false,
            conditions: base.conditions.map((c) => ({ ...c, met: !unmet.has(c.key) })),
          });
        }
        setStatusError(
          'This ticket cannot be resolved yet: someone added or reopened an action, or the owner changed. Review the checklist below.',
        );
      } else if (err instanceof ApiError && err.data.fieldErrors) {
        const firstError = Object.values(err.data.fieldErrors)[0];
        setStatusError(firstError ?? 'Unable to update the status. Please try again.');
      } else if (err instanceof ApiError && err.data.error === 'INVALID_STATUS_TRANSITION') {
        setStatusError(err.data.message ?? 'That transition is no longer permitted.');
      } else {
        setStatusError('Unable to update the status right now. Please try again.');
      }
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handlePostComment = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || isPostingComment) return;

    setIsPostingComment(true);
    setPostCommentError(null);
    try {
      const comment = await postComment(ticketId, trimmed);
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    } catch {
      setPostCommentError('Unable to post your comment. Please try again.');
    } finally {
      setIsPostingComment(false);
    }
  };

  const handlePostNote = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newNote.trim();
    if (!trimmed || isPostingNote) return;

    setIsPostingNote(true);
    setPostNoteError(null);
    try {
      const note = await postNote(ticketId, trimmed);
      setNotes((prev) => [...prev, note]);
      setNewNote('');
    } catch {
      setPostNoteError('Unable to save this internal note. Please try again.');
    } finally {
      setIsPostingNote(false);
    }
  };

  const handleDownload = async (attachmentId: number, fileName: string) => {
    setDownloadError(null);
    setDownloadingId(attachmentId);
    try {
      await downloadAttachment(attachmentId, fileName);
    } catch {
      setDownloadError(`Unable to download "${fileName}". Please try again.`);
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isValidId || notFound) {
    return (
      <div className="py-5 text-center">
        <div className="zg-state-panel">
          <div className="zg-state-panel__icon" aria-hidden="true">
            🚫
          </div>
          <div className="zg-state-panel__message">This ticket could not be found.</div>
          <Button variant="primary" onClick={() => navigate('/staff/tickets')}>
            Back to Queue
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-5">
        <LoadingState message="Loading ticket…" />
      </div>
    );
  }

  if (loadError || !ticket) {
    return (
      <div className="py-5">
        <ErrorState message={loadError ?? 'Unable to load this ticket.'} onRetry={() => setRetryCount((c) => c + 1)} />
      </div>
    );
  }

  const isResolving = selectedStatus === 'RESOLVED';
  const showsResolutionSummary = isResolving || selectedStatus === 'CLOSED';
  const needsReopenReason = ticket.currentStatus === 'RESOLVED' && selectedStatus === 'REOPENED';
  const summaryLength = resolutionSummaryInput.trim().length;
  // BR-14: the server is the authority; a payload without a gate (Lab 3) never blocks here.
  const gate = gateFromServer ?? ticket.resolutionGate ?? null;
  const confirmFieldsValid =
    (!isResolving || summaryLength >= 5) &&
    (selectedStatus !== 'CLOSED' || summaryLength === 0 || summaryLength >= 5) &&
    (!needsReopenReason || reopenReasonInput.trim().length >= 5) &&
    (!isResolving || !gate || gate.met);

  const conflictBanner = isStaleTicket && (
    <div className="zg-conflict-banner mb-3" role="alert">
      <div className="fw-semibold mb-2">{STALE_TICKET_MESSAGE}</div>
      <Button variant="primary" onClick={handleReloadLatest} busy={isReloading} busyLabel="Reloading…">
        Reload latest
      </Button>
    </div>
  );

  return (
    <div className="container-fluid p-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item">
            <Link to="/staff/tickets">Ticket Queue</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Ticket Detail
          </li>
        </ol>
      </nav>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-4">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <h1 className="h4 fw-bold mb-0 font-monospace" style={{ color: 'var(--color-primary)' }}>
            {ticket.ticketNumber}
          </h1>
          <Badge kind="status" value={ticket.currentStatus} />
          {ticket.requesterResolvedIndicator && <RequesterSaysResolvedPill />}
        </div>
        <Button variant="secondary" onClick={() => navigate('/staff/tickets')}>
          Back to Queue
        </Button>
      </div>

      {ticket.requesterResolvedIndicator && (
        <div className="zg-resolution-banner mb-4" role="status" data-testid="resolution-banner">
          Requester has indicated this issue appears resolved. Review and proceed with formal resolution if verified.
        </div>
      )}

      {/* Read-only overview */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4 p-md-5">
          <div className="row g-3 mb-4">
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-requester" label="Requester">
                <input
                  id="detail-requester"
                  type="text"
                  className="form-control field-readonly"
                  value={`${ticket.requester.name} (${ticket.requester.email})`}
                  readOnly
                  aria-readonly="true"
                  disabled
                />
              </FormField>
            </div>
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-category" label="Category">
                <input
                  id="detail-category"
                  type="text"
                  className="form-control field-readonly"
                  value={ticket.categoryName}
                  readOnly
                  aria-readonly="true"
                  disabled
                />
              </FormField>
            </div>
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-related-system" label="Related System">
                <input
                  id="detail-related-system"
                  type="text"
                  className="form-control field-readonly"
                  value={ticket.relatedSystemName}
                  readOnly
                  aria-readonly="true"
                  disabled
                />
              </FormField>
            </div>
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-requested-priority" label="Requested Priority">
                <div id="detail-requested-priority">
                  <Badge kind="priority" value={ticket.requestedPriority} />
                </div>
              </FormField>
            </div>
          </div>

          <FormField htmlFor="detail-summary" label="Summary">
            <div id="detail-summary" className="form-control field-readonly">
              {ticket.summary}
            </div>
          </FormField>
          <div className="mt-3">
            <FormField htmlFor="detail-description" label="Description">
              <div
                id="detail-description"
                className="form-control field-readonly"
                style={{ minHeight: 100, whiteSpace: 'pre-wrap' }}
              >
                {ticket.description}
              </div>
            </FormField>
          </div>
        </div>
      </div>

      {/* Operational editing panel */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <h2 className="h6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
            Operational Controls
          </h2>
          {!showStatusConfirm && conflictBanner}
          <div className="row g-4">
            <div className="col-12 col-md-4">
              <FormField htmlFor="owner-select" label="Ticket Owner" error={ownerError}>
                <select
                  id="owner-select"
                  className="form-select field-editable"
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  disabled={isSavingOwner}
                >
                  <option value="">Unassigned</option>
                  {staffMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="d-flex gap-2 mt-2">
                <Button
                  variant="secondary"
                  onClick={handleClaim}
                  disabled={isSavingOwner || ticket.ticketOwnerId === user?.id}
                  busy={isSavingOwner}
                >
                  Claim Ticket
                </Button>
                <Button variant="primary" onClick={handleSaveOwner} disabled={isSavingOwner} busy={isSavingOwner}>
                  Save Owner
                </Button>
              </div>
            </div>

            <div className="col-12 col-md-4">
              <FormField htmlFor="priority-select" label="IT Priority" error={priorityError}>
                <select
                  id="priority-select"
                  className="form-select field-editable"
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value as Priority)}
                  disabled={isSavingPriority}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </FormField>
              <div className="mt-2">
                <Button
                  variant="primary"
                  onClick={handleSavePriority}
                  disabled={isSavingPriority}
                  busy={isSavingPriority}
                >
                  Save Priority
                </Button>
              </div>
            </div>

            <div className="col-12 col-md-4">
              {ticket.permittedNextStatuses.length === 0 ? (
                // ui-spec §6.1: terminal statuses show a read-only badge instead of a control.
                <div className="zg-field">
                  <div className="zg-label">Status Workflow</div>
                  <div className="d-flex align-items-center gap-2">
                    <Badge kind="status" value={ticket.currentStatus} />
                    <span className="small text-muted">No further changes</span>
                  </div>
                </div>
              ) : (
              <>
              <FormField htmlFor="status-select" label="Status Workflow" error={showStatusConfirm ? null : statusError}>
                <select
                  id="status-select"
                  className="form-select field-editable"
                  value={selectedStatus}
                  onChange={(e) => handleStatusSelect(e.target.value)}
                  disabled={isSavingStatus}
                >
                  <option value="" disabled>
                    Select next status…
                  </option>
                  {ticket.permittedNextStatuses.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="mt-2">
                <Button
                  variant="primary"
                  onClick={handleSaveStatusClick}
                  disabled={!selectedStatus || isSavingStatus}
                  busy={isSavingStatus}
                >
                  Save Status
                </Button>
              </div>
              </>
              )}
            </div>
          </div>

          {showStatusConfirm && (
            <Modal
              title={`Confirm transition to ${STATUS_LABEL[selectedStatus as TicketStatus]}`}
              onClose={() => setShowStatusConfirm(false)}
            >
              <p className="small text-muted font-monospace mb-3">{ticket.ticketNumber}</p>
              {conflictBanner}
              {statusError && (
                <div className="zg-error-banner mb-3" role="alert">
                  {statusError}
                </div>
              )}

              {isResolving && gate && (
                <div className="mb-3">
                  {/* ui-spec §6.2: icon and text, never color alone. */}
                  <ul className="list-unstyled mb-2" aria-label="Resolution checklist">
                    {gate.conditions.map((c) => (
                      <li key={c.key} className="d-flex gap-2" style={{ color: c.met ? 'var(--color-success)' : 'var(--color-error)' }}>
                        <span aria-hidden="true">{c.met ? '✓' : '✗'}</span>
                        <span>{c.label}</span>
                        <span className="visually-hidden">{c.met ? '(met)' : '(not met)'}</span>
                      </li>
                    ))}
                    {gate.warnings.map((w) => (
                      <li key={w} className="d-flex gap-2" style={{ color: 'var(--color-warning)' }}>
                        <span aria-hidden="true">⚑</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                  {!gate.met && (
                    <a href="#actions-taken" className="small" onClick={() => setShowStatusConfirm(false)}>
                      Go to Actions Taken
                    </a>
                  )}
                </div>
              )}

              {showsResolutionSummary && (
                <FormField
                  htmlFor="resolution-summary"
                  label={isResolving ? 'Resolution Summary' : 'Resolution Summary (optional, keeps the current one when empty)'}
                  required={isResolving}
                >
                  <textarea
                    id="resolution-summary"
                    className="form-control field-editable"
                    rows={2}
                    placeholder="Describe how the issue was resolved (min 5 characters)"
                    value={resolutionSummaryInput}
                    onChange={(e) => setResolutionSummaryInput(e.target.value)}
                  />
                </FormField>
              )}

              {needsReopenReason && (
                <FormField htmlFor="reopen-reason" label="Reopen Reason" required>
                  <textarea
                    id="reopen-reason"
                    className="form-control field-editable"
                    rows={2}
                    placeholder="Why is this ticket being reopened? (min 5 characters)"
                    value={reopenReasonInput}
                    onChange={(e) => setReopenReasonInput(e.target.value)}
                  />
                </FormField>
              )}

              <div className="d-flex gap-2 justify-content-end mt-3">
                <Button variant="tertiary" onClick={() => setShowStatusConfirm(false)} disabled={isSavingStatus}>
                  Never Mind
                </Button>
                <Button
                  variant="primary"
                  onClick={applyStatusChange}
                  disabled={!confirmFieldsValid || isSavingStatus}
                  busy={isSavingStatus}
                  busyLabel="Saving…"
                >
                  Confirm
                </Button>
              </div>
            </Modal>
          )}
        </div>
      </div>

      {/* Attachments (read-only for staff) */}
      <div className="card border-0 shadow-sm mb-4" data-testid="staff-attachment-section">
        <div className="card-body p-4">
          <h2 className="h6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
            Attachments
          </h2>

          {downloadError && (
            <div className="zg-error-banner mb-3" role="alert">
              {downloadError}
            </div>
          )}

          {ticket.attachments.length === 0 && (
            <p className="text-muted small mb-0">No attachments have been added to this ticket.</p>
          )}

          {ticket.attachments.length > 0 && (
            <ul className="list-group list-group-flush border rounded">
              {ticket.attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="list-group-item p-3 d-flex justify-content-between align-items-center flex-wrap gap-2"
                  style={attachment.isRemoved ? { opacity: 0.7 } : undefined}
                >
                  <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                    <span aria-hidden="true">{attachment.mimeType === 'application/pdf' ? '📄' : '🖼️'}</span>
                    <span
                      className="text-truncate fw-medium"
                      style={attachment.isRemoved ? { textDecoration: 'line-through' } : undefined}
                      title={attachment.originalFileName}
                    >
                      {attachment.originalFileName}
                    </span>
                    <span className="badge bg-light text-dark border small flex-shrink-0">
                      {formatBytes(attachment.fileSizeBytes)}
                    </span>
                    {attachment.isRemoved && <span className="zg-badge badge-triage-pending">Removed</span>}
                  </div>
                  <Button
                    variant="secondary"
                    disabled={attachment.isRemoved}
                    busy={downloadingId === attachment.id}
                    busyLabel="Downloading…"
                    onClick={() => handleDownload(attachment.id, attachment.originalFileName)}
                  >
                    Download
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Actions Taken — Lab 4, between Attachments and Comments/Notes (docs/lab-04/ui-spec.md §5.1) */}
      <ActionsTakenSection
        key={`${ticket.id}-${workflowRefresh}`}
        ticketId={ticket.id}
        ticketCreatedAt={ticket.createdAt}
        mode="staff"
        writable={ACTION_WRITABLE_TICKET_STATUSES.includes(ticket.currentStatus)}
        staffMembers={staffMembers}
        currentUserId={user?.id}
      />

      {/* Status History — Lab 4 ui-spec §6.4 */}
      <StatusHistory ticketId={ticket.id} refreshKey={workflowRefresh} />

      {/* Public Comments — standard Zen Green styling, visible to the Requester */}
      <div className="card border-0 shadow-sm mb-4" data-testid="public-comments-section">
        <div className="card-body p-4">
          <h2 className="h6 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            Public Comments
          </h2>
          <p className="text-muted small mb-3">Comments posted here are visible to the Requester.</p>

          {commentsLoading && <LoadingState message="Loading comments…" />}
          {!commentsLoading && commentsError && <ErrorState message={commentsError} onRetry={loadComments} />}
          {!commentsLoading && !commentsError && comments.length === 0 && (
            <p className="text-muted small mb-3">No comments yet.</p>
          )}

          {!commentsLoading && !commentsError && comments.length > 0 && (
            <ul className="list-unstyled d-flex flex-column gap-3 mb-4">
              {comments.map((comment) => (
                <li key={comment.id} className="d-flex gap-2">
                  <span
                    className="zg-badge badge-role-requester flex-shrink-0"
                    aria-hidden="true"
                    style={{ borderRadius: '50%', width: 32, height: 32, justifyContent: 'center', padding: 0 }}
                  >
                    {comment.author.name.charAt(0).toUpperCase()}
                  </span>
                  <div
                    className="p-3 rounded flex-grow-1"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-field-editable-border)' }}
                  >
                    <div className="d-flex justify-content-between gap-2 mb-1">
                      <span className="fw-semibold small">
                        {comment.author.name} <Badge kind="role" value={comment.author.role} />
                      </span>
                      <span className="text-muted small">{formatDate(comment.createdAt)}</span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handlePostComment}>
            <FormField htmlFor="new-comment" label="Add Public Comment">
              <textarea
                id="new-comment"
                className="form-control field-editable"
                rows={3}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder="Reply to the Requester…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={isPostingComment}
              />
            </FormField>
            <div className="d-flex justify-content-between align-items-center mt-1">
              <span className="small text-muted font-monospace">
                {newComment.length} / {MAX_MESSAGE_LENGTH}
              </span>
              <Button
                type="submit"
                variant="primary"
                busy={isPostingComment}
                busyLabel="Posting…"
                disabled={!newComment.trim() || isPostingComment}
              >
                Post Comment
              </Button>
            </div>
            {postCommentError && (
              <div className="zg-validation-message mt-2" role="alert">
                {postCommentError}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Internal Notes — distinct amber/warning styling, strictly hidden from Requesters */}
      <div className="card shadow-sm zg-internal-notes-panel" data-testid="internal-notes-section">
        <div className="card-body p-4">
          <div className="zg-internal-notes-banner mb-3">
            🔒 Internal Notes — Visible ONLY to IT Staff and Administrators. Never shared with Requesters.
          </div>

          {notesLoading && <LoadingState message="Loading internal notes…" />}
          {!notesLoading && notesError && <ErrorState message={notesError} onRetry={loadNotes} />}
          {!notesLoading && !notesError && notes.length === 0 && (
            <p className="text-muted small mb-3">No internal notes yet.</p>
          )}

          {!notesLoading && !notesError && notes.length > 0 && (
            <ul className="list-unstyled d-flex flex-column gap-3 mb-4">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="p-3 rounded"
                  style={{ background: '#ffffff', border: '1px solid var(--color-warning)' }}
                >
                  <div className="d-flex justify-content-between gap-2 mb-1">
                    <span className="fw-semibold small">{note.author.name}</span>
                    <span className="text-muted small">{formatDate(note.createdAt)}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{note.content}</div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handlePostNote}>
            <FormField htmlFor="new-note" label="Add Internal Note">
              <textarea
                id="new-note"
                className="form-control field-editable"
                rows={3}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder="Record operational details for IT Staff/Administrators only…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                disabled={isPostingNote}
              />
            </FormField>
            <div className="d-flex justify-content-between align-items-center mt-1">
              <span className="small text-muted font-monospace">
                {newNote.length} / {MAX_MESSAGE_LENGTH}
              </span>
              <Button
                type="submit"
                variant="primary"
                busy={isPostingNote}
                busyLabel="Saving…"
                disabled={!newNote.trim() || isPostingNote}
              >
                Save Internal Note
              </Button>
            </div>
            {postNoteError && (
              <div className="zg-validation-message mt-2" role="alert">
                {postNoteError}
              </div>
            )}
          </form>
        </div>
      </div>

      {toast && (
        <div className="zg-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

export default StaffTicketDetail;
