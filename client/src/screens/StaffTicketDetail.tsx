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
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { formatDate } from '../utils/formatDate';
import { formatBytes } from '../utils/attachmentValidation';
import type { PublicComment, InternalNote } from '../types/comment';
import type { StaffMember, StaffTicketDetailData } from '../types/staffTicket';
import type { Priority, TicketStatus } from '../types/ticket';

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
      await updateTicketOwner(ticketId, user.id);
      setRetryCount((c) => c + 1);
    } catch {
      setOwnerError('Unable to claim this ticket right now. Please try again.');
    } finally {
      setIsSavingOwner(false);
    }
  };

  const handleSaveOwner = async () => {
    setIsSavingOwner(true);
    setOwnerError(null);
    try {
      const ticketOwnerId = selectedOwnerId ? Number(selectedOwnerId) : null;
      await updateTicketOwner(ticketId, ticketOwnerId);
      setRetryCount((c) => c + 1);
    } catch (err) {
      if (err instanceof ApiError && err.data.error === 'INVALID_TICKET_OWNER') {
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
      await updateItPriority(ticketId, selectedPriority);
      setRetryCount((c) => c + 1);
    } catch {
      setPriorityError('Unable to update IT Priority right now. Please try again.');
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
  };

  const handleSaveStatusClick = () => {
    if (!selectedStatus) return;
    if (CONFIRM_REQUIRED_STATUSES.includes(selectedStatus as TicketStatus)) {
      setShowStatusConfirm(true);
      return;
    }
    void applyStatusChange();
  };

  const applyStatusChange = async () => {
    if (!ticket || !selectedStatus) return;

    const needsResolutionSummary = selectedStatus === 'RESOLVED' || selectedStatus === 'CLOSED';
    const needsReopenReason = ticket.currentStatus === 'RESOLVED' && selectedStatus === 'REOPENED';

    if (needsResolutionSummary && resolutionSummaryInput.trim().length < 5) {
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
        resolutionSummary: needsResolutionSummary ? resolutionSummaryInput.trim() : undefined,
        reopenReason: needsReopenReason ? reopenReasonInput.trim() : undefined,
      });
      setShowStatusConfirm(false);
      setRetryCount((c) => c + 1);
    } catch (err) {
      if (err instanceof ApiError && err.data.fieldErrors) {
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

  const needsResolutionSummary = selectedStatus === 'RESOLVED' || selectedStatus === 'CLOSED';
  const needsReopenReason = ticket.currentStatus === 'RESOLVED' && selectedStatus === 'REOPENED';
  const confirmFieldsValid =
    (!needsResolutionSummary || resolutionSummaryInput.trim().length >= 5) &&
    (!needsReopenReason || reopenReasonInput.trim().length >= 5);

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
              <FormField htmlFor="status-select" label="Status Workflow" error={statusError}>
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
            </div>
          </div>

          {showStatusConfirm && (
            <div className="mt-4 p-3 rounded" style={{ background: 'var(--color-pale)' }}>
              <h3 className="h6 fw-bold mb-2">
                Confirm transition to {STATUS_LABEL[selectedStatus as TicketStatus]}
              </h3>

              {needsResolutionSummary && (
                <FormField htmlFor="resolution-summary" label="Resolution Summary" required>
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
            </div>
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
      <div className="card border-0 shadow-sm zg-internal-notes-panel" data-testid="internal-notes-section">
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
    </div>
  );
}

export default StaffTicketDetail;
