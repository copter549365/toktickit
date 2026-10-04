import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchTicketById,
  fetchComments,
  postComment,
  markProblemAppearsResolved,
  cancelTicket,
  ApiError,
} from '../api/tickets';
import { AttachmentSection } from '../components/AttachmentSection';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { formatDate } from '../utils/formatDate';
import type { Attachment } from '../types/attachment';
import type { PublicComment } from '../types/comment';
import type { TicketDetail as TicketDetailData } from '../types/ticket';

const MAX_COMMENT_LENGTH = 2000;
const RESOLVE_INDICATOR_ELIGIBLE_STATUSES = ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'];

export function RequesterTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const ticketId = Number(id);
  const isValidId = Number.isInteger(ticketId) && ticketId > 0;

  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Public Comments
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [postCommentError, setPostCommentError] = useState<string | null>(null);

  // Problem Appears Resolved
  const [isMarkingResolved, setIsMarkingResolved] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Cancel Ticket
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isValidId) return undefined;

    setIsLoading(true);
    setLoadError(null);
    setNotFound(false);

    const controller = new AbortController();
    fetchTicketById(ticketId, { signal: controller.signal })
      .then((data) => {
        setTicket(data);
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

  const loadComments = useCallback(() => {
    if (!isValidId) return undefined;

    setCommentsLoading(true);
    setCommentsError(null);

    const controller = new AbortController();
    fetchComments(ticketId)
      .then((data) => {
        setComments(data);
        setCommentsLoading(false);
      })
      .catch(() => {
        setCommentsError('Unable to load comments. Please try again.');
        setCommentsLoading(false);
      });

    return () => controller.abort();
  }, [ticketId, isValidId]);

  useEffect(() => {
    if (!ticket) return;
    const cleanup = loadComments();
    return cleanup;
    // Only re-fetch when the ticket itself first resolves — posting appends locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(ticket)]);

  const handleAttachmentAdded = (attachment: Attachment) => {
    setTicket((prev) => (prev ? { ...prev, attachments: [...prev.attachments, attachment] } : prev));
  };

  const handleAttachmentRemoved = (updated: Attachment) => {
    setTicket((prev) =>
      prev
        ? {
            ...prev,
            attachments: prev.attachments.map((a) =>
              a.id === updated.id ? { ...a, ...updated } : a,
            ),
          }
        : prev,
    );
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

  const handleMarkResolved = async () => {
    if (isMarkingResolved) return;
    setIsMarkingResolved(true);
    setResolveError(null);
    try {
      await markProblemAppearsResolved(ticketId);
      setTicket((prev) => (prev ? { ...prev, requesterResolvedIndicator: true } : prev));
    } catch {
      setResolveError('Unable to indicate resolution right now. Please try again.');
    } finally {
      setIsMarkingResolved(false);
    }
  };

  const handleConfirmCancel = async () => {
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason || isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      await cancelTicket(ticketId, trimmedReason);
      setTicket((prev) => (prev ? { ...prev, currentStatus: 'CANCELLED' } : prev));
      setShowCancelConfirm(false);
      setCancelReason('');
    } catch {
      setCancelError('Unable to cancel this ticket right now. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  if (!isValidId || notFound) {
    return (
      <div className="py-5 text-center">
        <div className="zg-state-panel">
          <div className="zg-state-panel__icon" aria-hidden="true">
            🚫
          </div>
          <div className="zg-state-panel__message">
            This ticket could not be found, or you do not have access to it.
          </div>
          <Button variant="primary" onClick={() => navigate('/tickets')}>
            Back to My Tickets
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
        <ErrorState
          message={loadError ?? 'Unable to load this ticket.'}
          onRetry={() => setRetryCount((c) => c + 1)}
        />
      </div>
    );
  }

  const canMarkResolved =
    !ticket.requesterResolvedIndicator && RESOLVE_INDICATOR_ELIGIBLE_STATUSES.includes(ticket.currentStatus);
  const canCancel = ticket.currentStatus === 'NEW';

  return (
    <div className="container-fluid p-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item">
            <Link to="/tickets">My Tickets</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Ticket Details
          </li>
        </ol>
      </nav>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-4">
        <div>
          <h1 className="h4 fw-bold mb-1 font-monospace" style={{ color: 'var(--color-primary)' }}>
            {ticket.ticketNumber}
          </h1>
          <p className="text-muted small mb-0">Ticket overview is read-only; use the actions below to respond.</p>
        </div>
        <div className="d-flex gap-2">
          {canCancel && (
            <Button variant="destructive" onClick={() => setShowCancelConfirm(true)} disabled={isCancelling}>
              Cancel Ticket
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate('/tickets')}>
            Back to My Tickets
          </Button>
        </div>
      </div>

      {showCancelConfirm && (
        <div className="card border-0 shadow-sm mb-4" style={{ background: 'var(--color-pale)' }}>
          <div className="card-body p-4">
            <h2 className="h6 fw-bold mb-2">Cancel this ticket?</h2>
            <p className="small text-muted mb-3">
              This ticket has not yet been taken up by IT Staff. Once cancelled, it cannot be reopened.
            </p>
            <FormField htmlFor="cancel-reason" label="Reason for cancellation" required>
              <textarea
                id="cancel-reason"
                className="form-control field-editable"
                rows={2}
                placeholder="Why are you cancelling this ticket?"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={isCancelling}
              />
            </FormField>
            {cancelError && (
              <div className="zg-validation-message mt-2" role="alert">
                {cancelError}
              </div>
            )}
            <div className="d-flex gap-2 justify-content-end mt-3">
              <Button
                variant="tertiary"
                onClick={() => {
                  setShowCancelConfirm(false);
                  setCancelReason('');
                  setCancelError(null);
                }}
                disabled={isCancelling}
              >
                Never Mind
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmCancel}
                disabled={!cancelReason.trim() || isCancelling}
                busy={isCancelling}
                busyLabel="Cancelling…"
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm">
        <div className="card-body p-4 p-md-5">
          <div className="row g-3 mb-4">
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-ticket-number" label="Ticket No.">
                <input
                  id="detail-ticket-number"
                  type="text"
                  className="form-control field-readonly font-monospace"
                  value={ticket.ticketNumber}
                  readOnly
                  aria-readonly="true"
                  disabled
                />
              </FormField>
            </div>
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-ticket-date" label="Ticket Date">
                <input
                  id="detail-ticket-date"
                  type="text"
                  className="form-control field-readonly"
                  value={formatDate(ticket.createdAt)}
                  readOnly
                  aria-readonly="true"
                  disabled
                />
              </FormField>
            </div>
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-requester" label="Requester">
                <input
                  id="detail-requester"
                  type="text"
                  className="form-control field-readonly"
                  value={user?.name ?? ''}
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
                  value={ticket.categoryName ?? ''}
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
              <FormField htmlFor="detail-ticket-owner" label="Ticket Owner">
                <input
                  id="detail-ticket-owner"
                  type="text"
                  className="form-control field-readonly"
                  value={ticket.ticketOwnerName ?? 'Unassigned'}
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
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-it-priority" label="IT Priority">
                <div id="detail-it-priority">
                  <Badge kind="itPriority" value={ticket.itPriority} />
                </div>
              </FormField>
            </div>
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-current-status" label="Current Status">
                <div id="detail-current-status">
                  <Badge kind="status" value={ticket.currentStatus} />
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
                style={{ minHeight: 120, whiteSpace: 'pre-wrap' }}
              >
                {ticket.description}
              </div>
            </FormField>
          </div>

          {/* Problem Appears Resolved (ui-spec.md §5.4, FR-13, BR-06) */}
          {(canMarkResolved || ticket.requesterResolvedIndicator) && (
            <div className="mt-4 pt-3 border-top">
              {ticket.requesterResolvedIndicator ? (
                <div className="zg-badge badge-priority-low" data-testid="resolved-indicator-confirmation">
                  ✓ You indicated this problem appears resolved. IT Staff will review and formally close it.
                </div>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={handleMarkResolved}
                    busy={isMarkingResolved}
                    busyLabel="Saving…"
                  >
                    Problem Appears Resolved
                  </Button>
                  {resolveError && (
                    <div className="zg-validation-message mt-2" role="alert">
                      {resolveError}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <AttachmentSection
        ticketId={ticket.id}
        attachments={ticket.attachments}
        onAttachmentAdded={handleAttachmentAdded}
        onAttachmentRemoved={handleAttachmentRemoved}
      />

      {/* Public Comments Thread (ui-spec.md §5.4, BR-04, BR-14, BR-15) */}
      <div className="card border-0 shadow-sm mt-4" data-testid="comment-thread">
        <div className="card-body p-4">
          <h2 className="h6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
            Public Comments
          </h2>

          {commentsLoading && <LoadingState message="Loading comments…" />}

          {!commentsLoading && commentsError && (
            <ErrorState message={commentsError} onRetry={loadComments} />
          )}

          {!commentsLoading && !commentsError && comments.length === 0 && (
            <p className="text-muted small mb-3">No comments yet. Be the first to add one.</p>
          )}

          {!commentsLoading && !commentsError && comments.length > 0 && (
            <ul className="list-unstyled d-flex flex-column gap-3 mb-4" data-testid="comment-list">
              {comments.map((comment) => (
                <li key={comment.id} className="d-flex gap-2" data-testid={`comment-${comment.id}`}>
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
                      <span className="fw-semibold small">{comment.author.name}</span>
                      <span className="text-muted small">{formatDate(comment.createdAt)}</span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handlePostComment}>
            <FormField htmlFor="new-comment" label="Add Comment">
              <textarea
                id="new-comment"
                className="form-control field-editable"
                rows={3}
                maxLength={MAX_COMMENT_LENGTH}
                placeholder="Share an update or ask a question…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={isPostingComment}
              />
            </FormField>
            <div className="d-flex justify-content-between align-items-center mt-1">
              <span className="small text-muted font-monospace">
                {newComment.length} / {MAX_COMMENT_LENGTH}
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
    </div>
  );
}

export default RequesterTicketDetail;
