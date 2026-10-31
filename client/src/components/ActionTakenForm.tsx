import { Fragment, useEffect, useRef, type RefObject } from 'react';
import { FormField } from './FormField';
import type { StaffMember } from '../types/staffTicket';
import type { UserRef } from '../types/actionTaken';
import type { ActionDraft, DraftErrors, DraftStatus } from '../utils/actionDraft';

export type ActionFormErrors = DraftErrors & { assigneeId?: string };

interface ActionTakenFormProps {
  idPrefix: string;
  draft: ActionDraft;
  onChange: (patch: Partial<ActionDraft>) => void;
  errors: ActionFormErrors;
  staffMembers: StaffMember[];
  /** Create mode shows the Planned / In Progress / Completed segmented control (ui-spec §5.3). */
  showStatus: boolean;
  resultRequired: boolean;
  disabled?: boolean;
  /** The stored assignee when it is no longer an active staff member (BR-06). */
  inactiveAssignee?: UserRef | null;
  descriptionRef?: RefObject<HTMLTextAreaElement | null>;
}

const STATUS_OPTIONS: { value: DraftStatus; label: string }[] = [
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
];

const MAX_DESCRIPTION = 2000;

function fieldClass(error?: string) {
  return `form-control field-editable${error ? ' field-invalid' : ''}`;
}

function describedBy(id: string, error?: string) {
  return error ? `${id}-error` : undefined;
}

/** The Action Taken fields shared by the create card and the edit drawer (docs/lab-04/ui-spec.md §5.3). */
export function ActionTakenForm({
  idPrefix,
  draft,
  onChange,
  errors,
  staffMembers,
  showStatus,
  resultRequired,
  disabled = false,
  inactiveAssignee,
  descriptionRef,
}: ActionTakenFormProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const followUpNoteRef = useRef<HTMLTextAreaElement>(null);
  const focusNoteNext = useRef(false);

  // ui-spec §10: revealing the Follow-up Note moves focus into it.
  useEffect(() => {
    if (draft.followUpRequired && focusNoteNext.current) {
      followUpNoteRef.current?.focus();
      focusNoteNext.current = false;
    }
  }, [draft.followUpRequired]);

  return (
    <div className="d-flex flex-column gap-3">
      <FormField htmlFor={id('at')} label="Action date and time (Bangkok time)" error={errors.actionAt}>
        <input
          id={id('at')}
          type="datetime-local"
          className={fieldClass(errors.actionAt)}
          value={draft.actionAt}
          onChange={(e) => onChange({ actionAt: e.target.value })}
          aria-invalid={!!errors.actionAt || undefined}
          aria-describedby={describedBy(id('at'), errors.actionAt)}
          disabled={disabled}
        />
      </FormField>

      <FormField htmlFor={id('description')} label="Description" required error={errors.description}>
        <textarea
          ref={descriptionRef}
          id={id('description')}
          className={fieldClass(errors.description)}
          rows={3}
          maxLength={MAX_DESCRIPTION}
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          required
          aria-invalid={!!errors.description || undefined}
          aria-describedby={describedBy(id('description'), errors.description)}
          disabled={disabled}
        />
        <div className="small text-muted font-monospace text-end">
          {draft.description.length} / {MAX_DESCRIPTION}
        </div>
      </FormField>

      {showStatus && (
        <fieldset>
          <legend className="zg-label">Status</legend>
          <div className="zg-segmented" role="radiogroup" aria-label="Status">
            {STATUS_OPTIONS.map((option) => (
              <Fragment key={option.value}>
                <input
                  type="radio"
                  className="visually-hidden"
                  id={id(`status-${option.value}`)}
                  name={id('status')}
                  value={option.value}
                  checked={draft.status === option.value}
                  onChange={() => onChange({ status: option.value })}
                  disabled={disabled}
                />
                <label htmlFor={id(`status-${option.value}`)}>{option.label}</label>
              </Fragment>
            ))}
          </div>
        </fieldset>
      )}

      <FormField htmlFor={id('result')} label="Result" required={resultRequired} error={errors.result}>
        <textarea
          id={id('result')}
          className={fieldClass(errors.result)}
          rows={2}
          maxLength={MAX_DESCRIPTION}
          value={draft.result}
          onChange={(e) => onChange({ result: e.target.value })}
          required={resultRequired}
          aria-invalid={!!errors.result || undefined}
          aria-describedby={describedBy(id('result'), errors.result)}
          disabled={disabled}
        />
      </FormField>

      <FormField htmlFor={id('assignee')} label="Assignee" error={errors.assigneeId}>
        <select
          id={id('assignee')}
          className={`form-select field-editable${errors.assigneeId ? ' field-invalid' : ''}`}
          value={draft.assigneeId}
          onChange={(e) => onChange({ assigneeId: e.target.value })}
          aria-invalid={!!errors.assigneeId || undefined}
          aria-describedby={describedBy(id('assignee'), errors.assigneeId)}
          disabled={disabled}
        >
          {inactiveAssignee && !staffMembers.some((m) => m.id === inactiveAssignee.id) && (
            <option value={String(inactiveAssignee.id)}>{inactiveAssignee.name} (inactive, reassign)</option>
          )}
          {staffMembers.map((member) => (
            <option key={member.id} value={String(member.id)}>
              {member.name}
            </option>
          ))}
        </select>
      </FormField>

      <div className="form-check">
        <input
          id={id('follow-up')}
          type="checkbox"
          className="form-check-input"
          checked={draft.followUpRequired}
          onChange={(e) => {
            focusNoteNext.current = e.target.checked;
            // Unchecking hides the note and discards its value (BR-04).
            onChange(e.target.checked ? { followUpRequired: true } : { followUpRequired: false, followUpNote: '' });
          }}
          aria-expanded={draft.followUpRequired}
          aria-controls={id('follow-up-note')}
          disabled={disabled}
        />
        <label htmlFor={id('follow-up')} className="form-check-label">
          Follow-Up Required?
        </label>
      </div>

      {draft.followUpRequired && (
        <FormField htmlFor={id('follow-up-note')} label="Follow-up Note" required error={errors.followUpNote}>
          <textarea
            ref={followUpNoteRef}
            id={id('follow-up-note')}
            className={fieldClass(errors.followUpNote)}
            rows={2}
            maxLength={1000}
            value={draft.followUpNote}
            onChange={(e) => onChange({ followUpNote: e.target.value })}
            required
            aria-invalid={!!errors.followUpNote || undefined}
            aria-describedby={describedBy(id('follow-up-note'), errors.followUpNote)}
            disabled={disabled}
          />
        </FormField>
      )}

      <FormField htmlFor={id('attachment-notes')} label="Attachment Notes" error={errors.attachmentNotes}>
        <input
          id={id('attachment-notes')}
          type="text"
          className={fieldClass(errors.attachmentNotes)}
          maxLength={1000}
          value={draft.attachmentNotes}
          onChange={(e) => onChange({ attachmentNotes: e.target.value })}
          aria-describedby={errors.attachmentNotes ? `${id('attachment-notes')}-error` : `${id('attachment-notes')}-help`}
          disabled={disabled}
        />
        <div id={`${id('attachment-notes')}-help`} className="small text-muted">
          Which file to look at, e.g. &lsquo;see screenshot error-03.png&rsquo;
        </div>
      </FormField>

      <div className="zg-field">
        <label htmlFor={id('performed-by')} className="zg-label">
          Performed by
        </label>
        <input
          id={id('performed-by')}
          type="text"
          className="form-control field-readonly"
          value="Set automatically when completed"
          readOnly
        />
      </div>
    </div>
  );
}

export default ActionTakenForm;
