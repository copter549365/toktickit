import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RequesterDashboard } from './RequesterDashboard';

/**
 * `/dashboard` renders the signed-in role's dashboard (docs/lab-04/ui-spec.md §2, FR-17).
 * Until the IT Staff and Administrator dashboard ships (Issue 7), those roles keep their Lab 3
 * landing pages (specification.md §11 D-17).
 */
export function DashboardHome() {
  const { user } = useAuth();

  if (user?.role === 'REQUESTER') return <RequesterDashboard />;
  if (user?.role === 'IT_STAFF') return <Navigate to="/staff/tickets" replace />;
  if (user?.role === 'ADMINISTRATOR') return <Navigate to="/admin/users" replace />;
  return null;
}

export default DashboardHome;
