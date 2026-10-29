import { useCallback, useEffect, useId, useState } from 'react';
import { STATUS_LABEL } from './Badge';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { fetchStatusHistory } from '../api/tickets';
import type { StatusHistoryEntry } from '../types/ticket';
import { formatBangkokDateTime } from '../utils/bangkokTime';

interface StatusHistoryProps {
  ticketId: number;
  /** Bump to re-fetch after a status change on the same screen (ui-spec §6.3). */
  refreshKey?: number;
}

/** Read-only, collapsible status timeline, oldest first (docs/lab-04/ui-spec.md §6.4, BR-17). */
export function StatusHistory({ ticketId, refreshKey = 0 }: StatusHistoryProps) {
  const listId = useId();
  const [entries, setEntries] = useState<StatusHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    try {
      setEntries(await fetchStatusHistory(ticketId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="card border-0 shadow-sm mb-4" aria-labelledby={`${listId}-heading`}>
      <div className="card-body p-4">
        <h2 id={`${listId}-heading`} className="h6 fw-bold mb-0">
          <button
            type="button"
            className="btn btn-link p-0 fw-bold text-decoration-none"
            style={{ color: 'var(--color-primary)' }}
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((v) => !v)}
          >
            <span aria-hidden="true">{expanded ? '▾' : '▸'} </span>
            Status History ({entries.length})
          </button>
        </h2>

        {expanded && (
          <div id={listId} className="mt-3">
            {isLoading && <LoadingState message="Loading status history…" />}
            {!isLoading && loadError && (
              <ErrorState message="Unable to load the status history. Please try again." onRetry={() => void load()} />
            )}
            {!isLoading && !loadError && entries.length === 0 && (
              <p className="text-muted small mb-0">No status changes yet.</p>
            )}
            {!isLoading && !loadError && entries.length > 0 && (
              <ol className="list-unstyled mb-0 d-flex flex-column gap-2">
                {entries.map((entry) => (
                  <li key={entry.id} className="p-3 rounded" style={{ background: 'var(--color-bg)' }}>
                    <div className="d-flex flex-wrap justify-content-between gap-2">
                      <span className="fw-semibold">
                        {entry.fromStatus
                          ? `${STATUS_LABEL[entry.fromStatus]} → ${STATUS_LABEL[entry.toStatus]}`
                          : STATUS_LABEL[entry.toStatus]}
                      </span>
                      <span className="small text-muted">{formatBangkokDateTime(entry.createdAt)}</span>
                    </div>
                    <div className="small text-muted">
                      {entry.isMigrated ? (
                        <span className="zg-badge badge-triage-pending">Migrated</span>
                      ) : (
                        <>By {entry.changedBy?.name ?? 'Unknown user'}</>
                      )}
                    </div>
                    {entry.note && <div className="small mt-1 zg-cell-text">{entry.note}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default StatusHistory;
