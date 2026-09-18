import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequester } from '../context/RequesterContext';

/**
 * Bridges the authenticated identity into the Lab 2 RequesterContext so the existing
 * ticket screens keep working over `x-requester-id` (server/src/app.ts verifyRequesterContext)
 * without a manual Development Requester selection step. Issue 3 removes the manual
 * selector from the application flow; Issue 4 replaces the underlying header-based
 * ticket API auth with the server session and retires this bridge and RequesterContext.
 */
export function RequesterSync() {
  const { user } = useAuth();
  const { requester, selectRequester, changeRequester } = useRequester();

  useEffect(() => {
    if (user?.role === 'REQUESTER') {
      if (!requester || requester.id !== user.id) {
        selectRequester({ id: user.id, name: user.name, email: user.email });
      }
    } else if (requester) {
      changeRequester();
    }
  }, [user, requester, selectRequester, changeRequester]);

  return null;
}

export default RequesterSync;
