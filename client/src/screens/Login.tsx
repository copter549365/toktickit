import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/auth';
import { FormField } from '../components/FormField';
import { Button } from '../components/Button';

/** Login screen (ui-spec.md §5.1). */
export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!email.trim()) {
      errors.email = 'Email is required.';
    }
    if (!password) {
      errors.password = 'Password is required.';
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
      const user = await login(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(from || '/', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.data.error === 'ACCOUNT_INACTIVE') {
        setFormError('This account has been deactivated. Please contact an administrator.');
      } else if (err instanceof ApiError && err.data.fieldErrors) {
        setFieldErrors(err.data.fieldErrors);
      } else if (err instanceof ApiError && err.status === 401) {
        setFormError('Invalid email or password.');
      } else {
        // A 5xx or unreachable server is not the user's fault, so don't blame their credentials.
        setFormError('Unable to sign in right now. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="card border-0 shadow-sm zg-auth-card">
        <div className="card-body p-4">
          <div className="text-center mb-4">
            <div className="mb-2" aria-hidden="true" style={{ fontSize: 32 }}>
              🎫
            </div>
            <h1 className="h4 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
              TokTickIT
            </h1>
            <p className="text-muted small mb-0">IT Support Ticketing</p>
          </div>

          <h2 className="h5 fw-bold text-center mb-4">Sign in to your account</h2>

          {formError && (
            <div className="zg-error-banner mb-4" role="alert">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <FormField htmlFor="login-email" label="Email" required error={fieldErrors.email}>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                className={`form-control field-editable ${fieldErrors.email ? 'field-invalid' : ''}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!fieldErrors.email}
                disabled={isSubmitting}
              />
            </FormField>

            <FormField htmlFor="login-password" label="Password" required error={fieldErrors.password}>
              <div className="d-flex gap-2">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`form-control field-editable ${fieldErrors.password ? 'field-invalid' : ''}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!fieldErrors.password}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="btn btn-zg-secondary"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isSubmitting}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </FormField>

            <div className="d-grid mt-3">
              <Button
                type="submit"
                variant="primary"
                busy={isSubmitting}
                busyLabel="Signing in…"
                disabled={isSubmitting}
              >
                Sign In
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
