import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './LoadingState';

/**
 * Route guard for the authenticated application (BR-01, BR-02, AC-01, AC-02).
 * Redirects to /login when no session exists, and to /change-password when the
 * authenticated user is still flagged mustChangePassword.
 */
export function RequireAuth() {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <LoadingState message="Checking your session…" />;
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

export default RequireAuth;
