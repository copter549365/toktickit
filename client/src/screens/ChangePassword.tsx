import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/auth';
import { FormField } from '../components/FormField';
import { Button } from '../components/Button';

interface PasswordRuleCheck {
  label: string;
  met: boolean;
}

function checkPasswordRules(password: string): PasswordRuleCheck[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Includes uppercase & lowercase letters', met: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    {
      label: 'Includes a number and a special character',
      met: /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password),
    },
  ];
}

/** Mandatory first-login password change screen (ui-spec.md §5.2, BR-02). */
export function ChangePassword() {
  const { user, status, changePassword } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ruleChecks = useMemo(() => checkPasswordRules(newPassword), [newPassword]);

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  // Nothing to force here — send an already-compliant user back into the app.
  if (user && !user.mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!currentPassword) {
      errors.currentPassword = 'Current password is required.';
    }
    if (!ruleChecks.every((rule) => rule.met)) {
      errors.newPassword = 'Password does not meet the complexity requirements.';
    }
    if (confirmPassword !== newPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.data.fieldErrors) {
        setFieldErrors(err.data.fieldErrors);
      } else if (err instanceof ApiError && err.data.error === 'INVALID_CURRENT_PASSWORD') {
        setFieldErrors({ currentPassword: 'Current password is incorrect.' });
      } else {
        setFormError('Unable to update your password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="card border-0 shadow-sm zg-auth-card zg-auth-card--wide">
        <div className="card-body p-4">
          <h1 className="h4 fw-bold text-center mb-1" style={{ color: 'var(--color-primary)' }}>
            Change Your Password
          </h1>
          <p className="text-muted small text-center mb-4">
            You must change your temporary password to continue.
          </p>

          {formError && (
            <div className="zg-error-banner mb-4" role="alert">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <FormField
              htmlFor="current-password"
              label="Current (temporary) password"
              required
              error={fieldErrors.currentPassword}
            >
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                className={`form-control field-editable ${fieldErrors.currentPassword ? 'field-invalid' : ''}`}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                aria-invalid={!!fieldErrors.currentPassword}
                disabled={isSubmitting}
              />
            </FormField>

            <FormField htmlFor="new-password" label="New password" required error={fieldErrors.newPassword}>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                className={`form-control field-editable ${fieldErrors.newPassword ? 'field-invalid' : ''}`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                aria-invalid={!!fieldErrors.newPassword}
                disabled={isSubmitting}
              />
            </FormField>

            <ul className="zg-password-checklist list-unstyled mb-3" aria-live="polite">
              {ruleChecks.map((rule) => (
                <li key={rule.label} className={rule.met ? 'is-met' : ''}>
                  <span aria-hidden="true">{rule.met ? '✓' : '○'}</span> {rule.label}
                </li>
              ))}
            </ul>

            <FormField
              htmlFor="confirm-password"
              label="Confirm password"
              required
              error={fieldErrors.confirmPassword}
            >
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                className={`form-control field-editable ${fieldErrors.confirmPassword ? 'field-invalid' : ''}`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={!!fieldErrors.confirmPassword}
                disabled={isSubmitting}
              />
            </FormField>

            <div className="d-grid mt-3">
              <Button
                type="submit"
                variant="primary"
                busy={isSubmitting}
                busyLabel="Updating…"
                disabled={isSubmitting}
              >
                Update Password and Enter
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChangePassword;
