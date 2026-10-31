import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { DrillDownState } from '../types/dashboard';

/**
 * FR-16: list screens keep their filters in the URL query string, so a dashboard drill-down link
 * reproduces the filtered view (docs/lab-04/ui-spec.md §7, spec D-17).
 */

const fromDashboardState = (state: unknown) => Boolean((state as DrillDownState | null)?.fromDashboard);

/**
 * The filters in the URL on first render, read with the screen's own validator, and whether a
 * dashboard link opened the screen (for the "Filtered from Dashboard" chip).
 */
export function useInitialUrlFilters<F>(read: (params: URLSearchParams) => F): { filters: F; fromDashboard: boolean } {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [initial] = useState(() => ({ filters: read(searchParams), fromDashboard: fromDashboardState(location.state) }));
  return initial;
}

/**
 * Keeps the URL and the screen's filters in step.
 * - Every change to `query` (the filters as a query string, defaults left out) replaces the URL,
 *   so Back is not flooded.
 * - A URL the hook did not write (the nav link, another drill-down) calls `onExternalChange`, so
 *   the screen reads its filters again.
 */
export function useUrlFilterSync(
  query: string,
  onExternalChange: (params: URLSearchParams, fromDashboard: boolean) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const lastQuery = useRef(searchParams.toString());
  const onExternalChangeRef = useRef(onExternalChange);
  onExternalChangeRef.current = onExternalChange;
  // Read through a ref: the effect below must run on URL changes only, and location.state
  // arrives together with the URL change it belongs to.
  const locationStateRef = useRef(location.state);
  locationStateRef.current = location.state;

  useEffect(() => {
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    setSearchParams(new URLSearchParams(query), { replace: true });
  }, [query, setSearchParams]);

  useEffect(() => {
    if (searchParams.toString() === lastQuery.current) return;
    lastQuery.current = searchParams.toString();
    onExternalChangeRef.current(searchParams, fromDashboardState(locationStateRef.current));
  }, [searchParams]);
}
