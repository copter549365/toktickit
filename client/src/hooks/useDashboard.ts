import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/tickets';

export type DashboardLoadState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failure' }
  | { kind: 'forbidden' };

/**
 * Loads a dashboard payload (ui-spec §4 "Refresh", §8 feedback states). Refresh keeps the current
 * data on screen and disables itself while loading; Retry goes back to the skeleton. Dashboards
 * never auto-poll.
 */
export function useDashboard<T>(fetcher: (options: { signal: AbortSignal }) => Promise<T>) {
  const [state, setState] = useState<DashboardLoadState<T>>({ kind: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsRefreshing(true);
    try {
      const data = await fetcherRef.current({ signal: controller.signal });
      if (!controller.signal.aborted) setState({ kind: 'ready', data });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState(err instanceof ApiError && err.status === 403 ? { kind: 'forbidden' } : { kind: 'failure' });
    } finally {
      if (!controller.signal.aborted) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    refresh();
  }, [refresh]);

  return { state, isRefreshing, refresh, retry };
}
