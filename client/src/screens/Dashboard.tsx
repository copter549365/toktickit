import { useAuth } from '../context/AuthContext';
import { RequesterDashboard } from './RequesterDashboard';
import { StaffDashboard } from './StaffDashboard';

/**
 * `/dashboard` renders the signed-in role's dashboard (docs/lab-04/ui-spec.md §2, FR-17).
 * IT Staff and Administrators share one dashboard; the server adds `userAccounts` for
 * Administrators (BR-24).
 */
export function DashboardHome() {
  const { user } = useAuth();

  if (user?.role === 'REQUESTER') return <RequesterDashboard />;
  if (user?.role === 'IT_STAFF' || user?.role === 'ADMINISTRATOR') return <StaffDashboard />;
  return null;
}

export default DashboardHome;
