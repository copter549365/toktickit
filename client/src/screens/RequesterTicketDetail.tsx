import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';
import { fetchTicketById, ApiError } from '../api/tickets';
import { AttachmentSection } from '../components/AttachmentSection';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { formatDate } from '../utils/formatDate';
import type { Attachment } from '../types/attachment';
import type { TicketDetail as TicketDetailData } from '../types/ticket';

export function RequesterTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { requester } = useRequester();
  const navigate = useNavigate();

  const ticketId = Number(id);
  const isValidId = Number.isInteger(ticketId) && ticketId > 0;

  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const load = useCallback(() => {
    if (!requester || !isValidId) return undefined;

    setIsLoading(true);
    setLoadError(null);
    setNotFound(false);

    const controller = new AbortController();
    fetchTicketById(requester.id, ticketId, { signal: controller.signal })
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
  }, [requester, ticketId, isValidId]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load, retryCount]);

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
          <p className="text-muted small mb-0">Ticket details are read-only in Lab 2.</p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/tickets')}>
          Back to My Tickets
        </Button>
      </div>

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
                  value={requester?.name ?? ''}
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
                  value="Unassigned"
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
                  <Badge kind="itPriority" />
                </div>
              </FormField>
            </div>
            <div className="col-12 col-md-4">
              <FormField htmlFor="detail-current-status" label="Current Status">
                <div id="detail-current-status">
                  <Badge kind="status" value={ticket.currentStatus as 'NEW'} />
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
        </div>
      </div>

      <AttachmentSection
        requesterId={requester!.id}
        ticketId={ticket.id}
        attachments={ticket.attachments}
        onAttachmentAdded={handleAttachmentAdded}
        onAttachmentRemoved={handleAttachmentRemoved}
      />
    </div>
  );
}

export default RequesterTicketDetail;
