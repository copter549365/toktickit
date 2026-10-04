import { useState, type ChangeEvent } from 'react';
import { uploadTicketAttachment, ApiError } from '../api/tickets';
import { downloadAttachment, removeAttachment } from '../api/attachments';
import { Button } from './Button';
import { formatBytes, validateAttachmentFile } from '../utils/attachmentValidation';
import { formatDate } from '../utils/formatDate';
import type { Attachment } from '../types/attachment';

const MAX_ACTIVE_ATTACHMENTS = 5;
const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 200;

function fileTypeIcon(mimeType: string): string {
  return mimeType === 'application/pdf' ? '📄' : '🖼️';
}

function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.data.error) {
      case 'ATTACHMENT_LIMIT_REACHED':
        return 'This ticket already has 5 active attachments. Remove one before adding another.';
      case 'UNSUPPORTED_FILE_TYPE':
        return 'That file type is not permitted. Allowed: JPG, PNG, WEBP, PDF.';
      case 'FILE_TOO_LARGE':
        return 'That file exceeds the 5 MB size limit.';
      default:
        return 'Unable to add attachment. Please try again.';
    }
  }
  return 'Unable to reach the server. Please check your connection and try again.';
}

function removeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.data.error) {
      case 'ATTACHMENT_ALREADY_REMOVED':
        return 'This attachment has already been removed.';
      case 'REMOVAL_REASON_REQUIRED':
        return 'A removal reason is required.';
      default:
        return 'Unable to remove attachment. Please try again.';
    }
  }
  return 'Unable to reach the server. Please check your connection and try again.';
}

interface AttachmentSectionProps {
  ticketId: number;
  attachments: Attachment[];
  onAttachmentAdded: (attachment: Attachment) => void;
  onAttachmentRemoved: (attachment: Attachment) => void;
}

/**
 * Ticket Detail attachments panel: active/removed lists, add-attachment control (reusing the
 * Create Ticket picker/validation), download, and soft-remove-with-reason (ui-spec.md §4.5).
 */
export function AttachmentSection({
  ticketId,
  attachments,
  onAttachmentAdded,
  onAttachmentRemoved,
}: AttachmentSectionProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [removalReasonInput, setRemovalReasonInput] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const activeAttachments = attachments.filter((a) => !a.isRemoved);
  const removedAttachments = attachments.filter((a) => a.isRemoved);
  const atCap = activeAttachments.length >= MAX_ACTIVE_ATTACHMENTS;

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const clientError = validateAttachmentFile(file);
    if (clientError) {
      setUploadError(clientError);
      return;
    }

    setIsUploading(true);
    try {
      const attachment = await uploadTicketAttachment(ticketId, file);
      onAttachmentAdded(attachment);
    } catch (err) {
      setUploadError(uploadErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const startRemoval = (attachmentId: number) => {
    setConfirmingId(attachmentId);
    setRemovalReasonInput('');
    setRemoveError(null);
  };

  const cancelRemoval = () => {
    setConfirmingId(null);
    setRemovalReasonInput('');
    setRemoveError(null);
  };

  const trimmedReason = removalReasonInput.trim();
  const reasonIsValid =
    trimmedReason.length >= MIN_REASON_LENGTH && trimmedReason.length <= MAX_REASON_LENGTH;

  const confirmRemoval = async () => {
    if (confirmingId === null || !reasonIsValid || isRemoving) return;

    setIsRemoving(true);
    setRemoveError(null);
    try {
      const updated = await removeAttachment(confirmingId, trimmedReason);
      onAttachmentRemoved(updated);
      setConfirmingId(null);
      setRemovalReasonInput('');
    } catch (err) {
      setRemoveError(removeErrorMessage(err));
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    setDownloadError(null);
    setDownloadingId(attachment.id);
    try {
      await downloadAttachment(attachment.id, attachment.originalFileName);
    } catch {
      setDownloadError(`Unable to download "${attachment.originalFileName}". Please try again.`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="card border-0 shadow-sm mt-4" data-testid="attachment-section">
      <div className="card-body p-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="h6 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
            Attachments
          </h2>
          <span className="small text-muted font-monospace">
            {activeAttachments.length} / {MAX_ACTIVE_ATTACHMENTS} attachments
          </span>
        </div>

        <div
          className="p-3 rounded mb-3"
          style={{ background: 'var(--color-bg)', border: '1px dashed var(--color-field-editable-border)' }}
        >
          <div className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between gap-2">
            <div>
              <label htmlFor="add-attachment-input" className="form-label mb-1 fw-semibold small">
                Add attachment
              </label>
              <div className="small text-muted">
                {atCap
                  ? 'Maximum of 5 active attachments reached. Remove one to add another.'
                  : 'Allowed types: JPG, PNG, WEBP, PDF (max 5 MB per file)'}
              </div>
            </div>
            <div>
              <input
                id="add-attachment-input"
                type="file"
                className="form-control form-control-sm"
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileSelect}
                disabled={atCap || isUploading}
              />
            </div>
          </div>

          {isUploading && <div className="small text-muted mt-2">Uploading…</div>}

          {uploadError && (
            <div className="zg-validation-message mt-2" role="alert">
              {uploadError}
            </div>
          )}
        </div>

        {downloadError && (
          <div className="zg-error-banner mb-3" role="alert">
            {downloadError}
          </div>
        )}

        {attachments.length === 0 && (
          <p className="text-muted small mb-0">No attachments have been added to this ticket yet.</p>
        )}

        {activeAttachments.length > 0 && (
          <ul className="list-group list-group-flush border rounded mb-3" data-testid="active-attachments-list">
            {activeAttachments.map((attachment) => (
              <li key={attachment.id} className="list-group-item p-3" data-testid={`attachment-row-${attachment.id}`}>
                <div className="d-flex flex-column flex-sm-row justify-content-sm-between align-items-sm-center gap-2">
                  <div className="d-flex flex-wrap align-items-center gap-2 w-100" style={{ minWidth: 0 }}>
                    <span aria-hidden="true" className="flex-shrink-0">
                      {fileTypeIcon(attachment.mimeType)}
                    </span>
                    <span
                      className="text-truncate fw-medium"
                      style={{ minWidth: 0, flex: '1 1 auto' }}
                      title={attachment.originalFileName}
                    >
                      {attachment.originalFileName}
                    </span>
                    <span className="badge bg-light text-dark border small flex-shrink-0">
                      {formatBytes(attachment.fileSizeBytes)}
                    </span>
                    {/* flex-basis 100% forces this onto its own line so it never competes with
                        the filename above for width (that's what was crushing long names to a
                        single ellipsised character on narrow viewports). */}
                    <span className="small text-muted" style={{ flexBasis: '100%' }}>
                      Uploaded {formatDate(attachment.uploadedAt)}
                    </span>
                  </div>
                  <div className="d-flex gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      busy={downloadingId === attachment.id}
                      busyLabel="Downloading…"
                      onClick={() => handleDownload(attachment)}
                    >
                      Download
                    </Button>
                    <Button variant="destructive" onClick={() => startRemoval(attachment.id)}>
                      Remove
                    </Button>
                  </div>
                </div>

                {confirmingId === attachment.id && (
                  <div className="mt-3 p-3 rounded" style={{ background: 'var(--color-pale)' }}>
                    <label htmlFor={`removal-reason-${attachment.id}`} className="zg-label">
                      Removal Reason
                      <span className="zg-required-marker" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <textarea
                      id={`removal-reason-${attachment.id}`}
                      className="form-control field-editable"
                      rows={2}
                      placeholder="Why is this attachment being removed? (3-200 characters)"
                      maxLength={MAX_REASON_LENGTH}
                      value={removalReasonInput}
                      onChange={(e) => setRemovalReasonInput(e.target.value)}
                    />
                    {removeError && (
                      <div className="zg-validation-message mt-2" role="alert">
                        {removeError}
                      </div>
                    )}
                    <div className="d-flex gap-2 justify-content-end mt-2">
                      <Button variant="tertiary" onClick={cancelRemoval} disabled={isRemoving}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={confirmRemoval}
                        disabled={!reasonIsValid || isRemoving}
                        busy={isRemoving}
                        busyLabel="Removing…"
                      >
                        Confirm Removal
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {removedAttachments.length > 0 && (
          <>
            <h3 className="small fw-bold text-muted text-uppercase mb-2">Removed</h3>
            <ul className="list-group list-group-flush border rounded" data-testid="removed-attachments-list">
              {removedAttachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="list-group-item p-3"
                  data-testid={`attachment-row-${attachment.id}`}
                  style={{ opacity: 0.8 }}
                >
                  <div className="d-flex flex-column flex-sm-row justify-content-sm-between align-items-sm-center gap-2">
                    <div className="d-flex align-items-center gap-2 w-100" style={{ minWidth: 0 }}>
                      <span aria-hidden="true" className="flex-shrink-0">
                        {fileTypeIcon(attachment.mimeType)}
                      </span>
                      <span
                        className="text-truncate fw-medium text-muted"
                        style={{ textDecoration: 'line-through', minWidth: 0, flex: '1 1 auto' }}
                        title={attachment.originalFileName}
                      >
                        {attachment.originalFileName}
                      </span>
                      <span className="zg-badge badge-triage-pending flex-shrink-0">Removed</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-zg-secondary flex-shrink-0"
                      disabled
                      title="This attachment was removed and can no longer be downloaded."
                    >
                      Download
                    </button>
                  </div>
                  <div className="small text-muted mt-2">
                    Removed {attachment.removedAt ? formatDate(attachment.removedAt) : ''}
                    {attachment.removalReason ? ` — ${attachment.removalReason}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default AttachmentSection;
