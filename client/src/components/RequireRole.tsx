import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/user';

interface RequireRoleProps {
  roles: UserRole[];
}

/**
 * Client-side role gate for a group of routes (FR-08, FR-09, handout §8.6 "forbidden" feedback).
 * The backend's requireRole() stays the real authorization boundary; this only replaces the
 * generic "Unable to load" failure a wrong-role user would otherwise see with a clear forbidden
 * state, without rendering any of the screen's controls. Must sit inside RequireAuth.
 */
export function RequireRole({ roles }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return (
      <div className="py-5 text-center" data-testid="forbidden-state">
        <div className="zg-state-panel" role="alert">
          <div className="zg-state-panel__icon" aria-hidden="true">
            🔒
          </div>
          <div className="zg-state-panel__message">You do not have permission to view this page.</div>
          <Link to="/" className="btn btn-zg-primary">
            Go to my home screen
          </Link>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default RequireRole;
