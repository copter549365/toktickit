import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorState } from './ErrorState';
import type { UserRole } from '../types/user';

interface RequireRoleProps {
  roles: UserRole[];
}

/**
 * Client-side role gate for a group of routes (FR-08, FR-09, handout §8.6 "forbidden" feedback).
 * The backend's requireRole() stays the real authorization boundary; this only replaces the
 * generic "Unable to load" failure a wrong-role user would otherwise see with the shared forbidden
 * state (Lab 4 ui-spec §8), without rendering any of the screen's controls. Must sit inside
 * RequireAuth.
 */
export function RequireRole({ roles }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return (
      <div className="py-5 text-center">
        <ErrorState variant="forbidden" />
      </div>
    );
  }

  return <Outlet />;
}

export default RequireRole;
