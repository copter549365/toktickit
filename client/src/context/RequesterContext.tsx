import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Requester } from '../types/requester';

const STORAGE_KEY = 'toktickit.actingRequester';

interface RequesterContextValue {
  requester: Requester | null;
  selectRequester: (requester: Requester) => void;
  changeRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | undefined>(undefined);

function readStoredRequester(): Requester | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Requester) : null;
  } catch {
    return null;
  }
}

/**
 * Holds the acting Development Requester identity for the session (BR-03, BR-06, BR-08).
 * This is a testing convenience, not authentication — the backend independently re-validates
 * the requester id sent via the `x-requester-id` header on every request.
 */
export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(() => readStoredRequester());

  const selectRequester = useCallback((next: Requester) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRequester(next);
  }, []);

  const changeRequester = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setRequester(null);
  }, []);

  const value = useMemo(
    () => ({ requester, selectRequester, changeRequester }),
    [requester, selectRequester, changeRequester],
  );

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>;
}

export function useRequester(): RequesterContextValue {
  const context = useContext(RequesterContext);
  if (!context) {
    throw new Error('useRequester must be used within a RequesterProvider');
  }
  return context;
}
