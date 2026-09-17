import { Navigate, Outlet } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';

/**
 * Route guard: redirects to the Development Requester Selection screen when no acting
 * Requester is set (AC-02). Ticket screens are never reachable without a selected identity.
 */
export function RequireRequester() {
  const { requester } = useRequester();

  if (!requester) {
    return <Navigate to="/select-requester" replace />;
  }

  return <Outlet />;
}

export default RequireRequester;
