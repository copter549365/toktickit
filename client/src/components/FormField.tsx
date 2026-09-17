import type { ReactNode } from 'react';

interface FormFieldProps {
  /** Must match the wrapped control's `id` for label association. */
  htmlFor: string;
  label: string;
  required?: boolean;
  /** Validation message; when present the field renders as invalid (ui-spec.md §3 "Invalid"). */
  error?: string | null;
  children: ReactNode;
}

/**
 * Label + required-asterisk + validation-message wrapper (ui-spec.md §3 "Fields").
 * Screens compose their own <input>/<select>/<textarea> as children, styled with the
 * `.field-editable` / `.field-readonly` / `.field-invalid` classes from zen-green.css.
 */
export function FormField({ htmlFor, label, required = false, error, children }: FormFieldProps) {
  const errorId = `${htmlFor}-error`;

  return (
    <div className="zg-field">
      <label htmlFor={htmlFor} className="zg-label">
        {label}
        {required && (
          <span className="zg-required-marker" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <div id={errorId} className="zg-validation-message" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export default FormField;
