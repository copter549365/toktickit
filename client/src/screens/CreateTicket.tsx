import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';
import { fetchCategories } from '../api/categories';
import { fetchActiveRelatedSystems } from '../api/relatedSystems';
import { createTicket, uploadTicketAttachment, ApiError } from '../api/tickets';
import { FormField } from '../components/FormField';
import { Button } from '../components/Button';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import type { Category } from '../types/category';
import type { RelatedSystem } from '../types/relatedSystem';
import type { Priority, Ticket } from '../types/ticket';
import { formatBytes, validateAttachmentFile } from '../utils/attachmentValidation';

export function CreateTicket() {
  const { requester } = useRequester();
  const navigate = useNavigate();

  // Reference data loading state
  const [loadingRefData, setLoadingRefData] = useState(true);
  const [refDataError, setRefDataError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);

  // Form field state
  const [categoryId, setCategoryId] = useState<string>('');
  const [relatedSystemId, setRelatedSystemId] = useState<string>('');
  const [requestedPriority, setRequestedPriority] = useState<Priority>('MEDIUM');
  const [summary, setSummary] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  // Pending attachments
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Validation & submission state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success state
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [failedUploads, setFailedUploads] = useState<string[]>([]);

  const loadReferenceData = useCallback(async () => {
    setLoadingRefData(true);
    setRefDataError(null);
    try {
      const [cats, systems] = await Promise.all([
        fetchCategories(),
        fetchActiveRelatedSystems(),
      ]);
      setCategories(cats);
      setRelatedSystems(systems);
      if (cats.length > 0) setCategoryId(String(cats[0].id));
      if (systems.length > 0) setRelatedSystemId(String(systems[0].id));
    } catch {
      setRefDataError('Failed to load form reference data. Please try again.');
    } finally {
      setLoadingRefData(false);
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setAttachmentError(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const currentCount = pendingFiles.length;
    const newFiles: File[] = [];

    for (const file of files) {
      if (currentCount + newFiles.length >= 5) {
        setAttachmentError('Maximum of 5 attachments allowed per ticket.');
        break;
      }

      const error = validateAttachmentFile(file);
      if (error) {
        setAttachmentError(error);
        continue;
      }

      newFiles.push(file);
    }

    if (newFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...newFiles]);
    }

    // Reset input value so same file can be selected again if removed
    e.target.value = '';
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError(null);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      errors.summary = 'Summary is required.';
    } else if (trimmedSummary.length < 5 || trimmedSummary.length > 120) {
      errors.summary = 'Summary must be 5-120 characters.';
    }

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      errors.description = 'Description is required.';
    } else if (trimmedDescription.length < 10 || trimmedDescription.length > 2000) {
      errors.description = 'Description must be 10-2000 characters.';
    }

    if (!categoryId) {
      errors.categoryId = 'Category is required.';
    }

    if (!relatedSystemId) {
      errors.relatedSystemId = 'Related System is required.';
    }

    if (!requestedPriority) {
      errors.requestedPriority = 'Requested Priority is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setSubmitError(null);
    setAttachmentError(null);

    if (!validateForm()) {
      return;
    }

    if (!requester) {
      navigate('/select-requester', { replace: true });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Create Ticket row
      const ticket = await createTicket(requester.id, {
        categoryId: Number(categoryId),
        relatedSystemId: Number(relatedSystemId),
        summary: summary.trim(),
        description: description.trim(),
        requestedPriority,
      });

      // 2. Upload pending attachments sequentially (BR-18)
      const failed: string[] = [];
      for (const file of pendingFiles) {
        try {
          await uploadTicketAttachment(requester.id, ticket.id, file);
        } catch {
          failed.push(file.name);
        }
      }

      setCreatedTicket(ticket);
      setFailedUploads(failed);
    } catch (err) {
      if (err instanceof ApiError && err.data.fieldErrors) {
        setFieldErrors(err.data.fieldErrors);
      } else if (err instanceof ApiError && err.data.error === 'INVALID_REFERENCE') {
        setSubmitError('One or more selected reference values are invalid or inactive.');
      } else {
        setSubmitError('Unable to create ticket. Please check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setCreatedTicket(null);
    setFailedUploads([]);
    setSummary('');
    setDescription('');
    setRequestedPriority('MEDIUM');
    setPendingFiles([]);
    setFieldErrors({});
    setSubmitError(null);
    setAttachmentError(null);
    if (categories.length > 0) setCategoryId(String(categories[0].id));
    if (relatedSystems.length > 0) setRelatedSystemId(String(relatedSystems[0].id));
  };

  const handleCancel = () => {
    navigate('/tickets');
  };

  if (loadingRefData) {
    return (
      <div className="py-5">
        <LoadingState message="Loading ticket form…" />
      </div>
    );
  }

  if (refDataError) {
    return (
      <div className="py-5">
        <ErrorState message={refDataError} onRetry={loadReferenceData} />
      </div>
    );
  }

  // Render Success State (UI-05, AC-01)
  if (createdTicket) {
    return (
      <div className="container-fluid p-0">
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 p-md-5 text-center">
            <div className="mb-3" aria-hidden="true" style={{ fontSize: 48 }}>
              ✅
            </div>
            <h1 className="h3 fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>
              Ticket Created Successfully
            </h1>
            <p className="text-muted mb-4">
              Your support ticket has been submitted with status <strong>NEW</strong>.
            </p>

            <div
              className="p-4 mx-auto mb-4 rounded"
              style={{
                background: 'var(--color-pale)',
                maxWidth: 480,
                border: '1px solid var(--color-secondary)',
              }}
            >
              <div className="small text-muted mb-1 text-uppercase fw-semibold tracking-wide">
                Assigned Ticket Number
              </div>
              <div
                className="h2 fw-bold mb-0 font-monospace"
                style={{ color: 'var(--color-primary)' }}
                data-testid="ticket-number-display"
              >
                {createdTicket.ticketNumber}
              </div>
            </div>

            {failedUploads.length > 0 && (
              <div className="alert alert-warning text-start mx-auto mb-4" style={{ maxWidth: 480 }} role="alert">
                <strong>Notice:</strong> The ticket was created, but the following attachment(s) could not be uploaded:
                <ul className="mb-0 mt-1">
                  {failedUploads.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
                <div className="small mt-2">You can retry adding attachments from the Ticket Detail screen.</div>
              </div>
            )}

            <div className="d-flex gap-3 justify-content-center flex-wrap">
              <Button
                variant="primary"
                onClick={() => navigate(`/tickets/${createdTicket.id}`)}
              >
                View Ticket
              </Button>
              <Button variant="secondary" onClick={handleResetForm}>
                Create Another Ticket
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-0">
      <div className="card border-0 shadow-sm">
        <div className="card-body p-4 p-md-5">
          <div className="mb-4 pb-2 border-bottom">
            <h1 className="h4 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
              Create New Support Ticket
            </h1>
            <p className="text-muted small mb-0">
              Submit a support request to the IT helpdesk. Fields marked with an asterisk (<span className="text-danger">*</span>) are required.
            </p>
          </div>

          {submitError && (
            <div className="zg-error-banner mb-4" role="alert">
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* 1. System-generated / Read-only Fields Group */}
            <div className="mb-4">
              <h2 className="h6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
                System Information
              </h2>
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <FormField htmlFor="ticket-number-readonly" label="Ticket Number">
                    <input
                      id="ticket-number-readonly"
                      type="text"
                      className="form-control field-readonly"
                      value="Assigned after submission"
                      readOnly
                      aria-readonly="true"
                      disabled
                    />
                  </FormField>
                </div>
                <div className="col-12 col-md-4">
                  <FormField htmlFor="ticket-date-readonly" label="Ticket Date">
                    <input
                      id="ticket-date-readonly"
                      type="text"
                      className="form-control field-readonly"
                      value="Assigned after submission"
                      readOnly
                      aria-readonly="true"
                      disabled
                    />
                  </FormField>
                </div>
                <div className="col-12 col-md-4">
                  <FormField htmlFor="requester-name-readonly" label="Requester">
                    <input
                      id="requester-name-readonly"
                      type="text"
                      className="form-control field-readonly"
                      value={requester?.name || ''}
                      readOnly
                      aria-readonly="true"
                    />
                  </FormField>
                </div>
              </div>
            </div>

            {/* 2. Classification Group */}
            <div className="mb-4">
              <h2 className="h6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
                Ticket Classification
              </h2>
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <FormField
                    htmlFor="category-select"
                    label="Category"
                    required
                    error={fieldErrors.categoryId}
                  >
                    <select
                      id="category-select"
                      className={`form-select field-editable ${fieldErrors.categoryId ? 'field-invalid' : ''}`}
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      aria-invalid={!!fieldErrors.categoryId}
                      aria-describedby={fieldErrors.categoryId ? 'category-select-error' : undefined}
                    >
                      <option value="" disabled>
                        Select category…
                      </option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="col-12 col-md-4">
                  <FormField
                    htmlFor="related-system-select"
                    label="Related System"
                    required
                    error={fieldErrors.relatedSystemId}
                  >
                    <select
                      id="related-system-select"
                      className={`form-select field-editable ${fieldErrors.relatedSystemId ? 'field-invalid' : ''}`}
                      value={relatedSystemId}
                      onChange={(e) => setRelatedSystemId(e.target.value)}
                      aria-invalid={!!fieldErrors.relatedSystemId}
                      aria-describedby={fieldErrors.relatedSystemId ? 'related-system-select-error' : undefined}
                    >
                      <option value="" disabled>
                        Select related system…
                      </option>
                      {relatedSystems.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="col-12 col-md-4">
                  <FormField
                    htmlFor="priority-select"
                    label="Requested Priority"
                    required
                    error={fieldErrors.requestedPriority}
                  >
                    <select
                      id="priority-select"
                      className={`form-select field-editable ${fieldErrors.requestedPriority ? 'field-invalid' : ''}`}
                      value={requestedPriority}
                      onChange={(e) => setRequestedPriority(e.target.value as Priority)}
                      aria-invalid={!!fieldErrors.requestedPriority}
                      aria-describedby={fieldErrors.requestedPriority ? 'priority-select-error' : undefined}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </FormField>
                </div>
              </div>
            </div>

            {/* 3. Problem Details Group */}
            <div className="mb-4">
              <h2 className="h6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
                Problem Details
              </h2>
              <div className="d-flex flex-column gap-3">
                <FormField
                  htmlFor="summary-input"
                  label="Summary"
                  required
                  error={fieldErrors.summary}
                >
                  <input
                    id="summary-input"
                    type="text"
                    className={`form-control field-editable ${fieldErrors.summary ? 'field-invalid' : ''}`}
                    placeholder="Brief summary of the issue (5–120 characters)"
                    value={summary}
                    maxLength={120}
                    onChange={(e) => setSummary(e.target.value)}
                    aria-invalid={!!fieldErrors.summary}
                    aria-describedby={fieldErrors.summary ? 'summary-input-error' : undefined}
                  />
                </FormField>

                <FormField
                  htmlFor="description-textarea"
                  label="Description"
                  required
                  error={fieldErrors.description}
                >
                  <textarea
                    id="description-textarea"
                    rows={5}
                    className={`form-control field-editable ${fieldErrors.description ? 'field-invalid' : ''}`}
                    placeholder="Detailed explanation of the issue, steps to reproduce, or symptoms (10–2000 characters)"
                    style={{ resize: 'vertical' }}
                    value={description}
                    maxLength={2000}
                    onChange={(e) => setDescription(e.target.value)}
                    aria-invalid={!!fieldErrors.description}
                    aria-describedby={fieldErrors.description ? 'description-textarea-error' : undefined}
                  />
                </FormField>
              </div>
            </div>

            {/* 4. Attachments Section */}
            <div className="mb-4 pb-2">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
                  Attachments
                </h2>
                <span className="small text-muted font-monospace">
                  {pendingFiles.length} / 5 attachments
                </span>
              </div>

              <div className="p-3 rounded mb-3" style={{ background: 'var(--color-bg)', border: '1px dashed var(--color-field-editable-border)' }}>
                <div className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between gap-2">
                  <div>
                    <label htmlFor="attachment-file-input" className="form-label mb-1 fw-semibold small">
                      Select file to attach
                    </label>
                    <div className="small text-muted">
                      Allowed types: JPG, PNG, WEBP, PDF (max 5 MB per file)
                    </div>
                  </div>
                  <div>
                    <input
                      id="attachment-file-input"
                      type="file"
                      className="form-control form-control-sm"
                      accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                      onChange={handleFileSelect}
                      disabled={pendingFiles.length >= 5 || isSubmitting}
                    />
                  </div>
                </div>

                {attachmentError && (
                  <div className="zg-validation-message mt-2" role="alert">
                    {attachmentError}
                  </div>
                )}
              </div>

              {pendingFiles.length > 0 && (
                <ul className="list-group list-group-flush border rounded">
                  {pendingFiles.map((file, index) => (
                    <li
                      key={index}
                      className="list-group-item d-flex justify-content-between align-items-center py-2 px-3"
                    >
                      <div className="d-flex align-items-center gap-2 text-truncate me-2">
                        <span aria-hidden="true">📎</span>
                        <span className="text-truncate fw-medium small" title={file.name}>
                          {file.name}
                        </span>
                        <span className="badge bg-light text-dark border small">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger py-0 px-2"
                        onClick={() => removePendingFile(index)}
                        disabled={isSubmitting}
                        aria-label={`Remove attachment ${file.name}`}
                      >
                        ✕ Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 5. Action Buttons */}
            <div className="d-flex gap-2 justify-content-end pt-3 border-top">
              <Button
                variant="secondary"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                busy={isSubmitting}
                busyLabel="Submitting…"
                disabled={isSubmitting}
              >
                Submit Ticket
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CreateTicket;
