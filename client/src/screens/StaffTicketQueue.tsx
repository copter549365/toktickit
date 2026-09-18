import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchCategories } from '../api/categories';
import { fetchStaffQueue, ApiError } from '../api/staffTickets';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { NoResultsState } from '../components/NoResultsState';
import type { Category } from '../types/category';
import type { Priority, TicketStatus } from '../types/ticket';
import type { OwnerFilter, StaffQueueSortField, StaffTicketListItem, StaffQueueListMeta } from '../types/staffTicket';
import { formatDate } from '../utils/formatDate';

const DEFAULT_SORT_BY: StaffQueueSortField = 'createdAt';
const DEFAULT_SORT_ORDER: 'asc' | 'desc' = 'desc';
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'WAITING_FOR_REQUESTER', label: 'Waiting for Requester' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'REOPENED', label: 'Reopened' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const SORT_COLUMNS: { field: StaffQueueSortField; label: string }[] = [
  { field: 'ticketNumber', label: 'Ticket No.' },
  { field: 'createdAt', label: 'Created Date' },
  { field: 'requestedPriority', label: 'Req. Priority' },
  { field: 'itPriority', label: 'IT Priority' },
  { field: 'currentStatus', label: 'Status' },
];

function getPaginationItems(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

/** IT Staff Ticket Queue (ui-spec.md §5.5, api-spec.md §3, AC-05). */
export function StaffTicketQueue() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [requestedPriority, setRequestedPriority] = useState<Priority | ''>('');
  const [itPriority, setItPriority] = useState<Priority | ''>('');
  const [currentStatus, setCurrentStatus] = useState<TicketStatus | ''>('');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [sortBy, setSortBy] = useState<StaffQueueSortField>(DEFAULT_SORT_BY);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(DEFAULT_SORT_ORDER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(10);
  const [retryCount, setRetryCount] = useState(0);

  const [tickets, setTickets] = useState<StaffTicketListItem[]>([]);
  const [meta, setMeta] = useState<StaffQueueListMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasActiveFilters = Boolean(
    search || categoryId || requestedPriority || itPriority || currentStatus || ownerFilter !== 'all',
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    setLoadError(null);

    let ignore = false;
    const controller = new AbortController();

    const ticketOwnerId: number | 'unassigned' | undefined =
      ownerFilter === 'unassigned' ? 'unassigned' : ownerFilter === 'me' ? user.id : undefined;

    fetchStaffQueue(
      {
        search: search || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        requestedPriority: requestedPriority || undefined,
        itPriority: itPriority || undefined,
        currentStatus: currentStatus || undefined,
        ticketOwnerId,
        sortBy,
        sortOrder,
        page,
        pageSize,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (!ignore) {
          setTickets(response.data);
          setMeta(response.meta);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore && !(err instanceof DOMException && err.name === 'AbortError')) {
          if (err instanceof ApiError) {
            setLoadError('Unable to load the ticket queue. Please try again.');
          } else {
            setLoadError('Unable to reach the server. Please check your connection and try again.');
          }
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [user, search, categoryId, requestedPriority, itPriority, currentStatus, ownerFilter, sortBy, sortOrder, page, pageSize, retryCount]);

  const handleSort = (field: StaffQueueSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategoryId('');
    setRequestedPriority('');
    setItPriority('');
    setCurrentStatus('');
    setOwnerFilter('all');
    setSortBy(DEFAULT_SORT_BY);
    setSortOrder(DEFAULT_SORT_ORDER);
    setPage(1);
  };

  const handlePageSizeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value) as 10 | 20 | 50);
    setPage(1);
  };

  const openTicket = (id: number) => navigate(`/staff/tickets/${id}`);

  const sortIndicator = (field: StaffQueueSortField) => {
    if (sortBy !== field) return null;
    return (
      <span aria-hidden="true" className="ms-1">
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  return (
    <div className="container-fluid p-0">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-4">
        <div>
          <h1 className="h4 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            IT Staff Ticket Queue
          </h1>
          <p className="text-muted small mb-0">
            {meta ? `Showing ${tickets.length} of ${meta.totalCount} tickets.` : 'Loading tickets…'}
          </p>
        </div>
        <Button variant="tertiary" onClick={handleClearFilters} disabled={!hasActiveFilters}>
          Clear Filters
        </Button>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-3">
              <label htmlFor="queue-search-input" className="zg-label">
                Search
              </label>
              <input
                id="queue-search-input"
                type="search"
                className="form-control field-editable"
                placeholder="Search by ticket number or summary"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-2">
              <label htmlFor="queue-category-filter" className="zg-label">
                Category
              </label>
              <select
                id="queue-category-filter"
                className="form-select field-editable"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label htmlFor="queue-status-filter" className="zg-label">
                Status
              </label>
              <select
                id="queue-status-filter"
                className="form-select field-editable"
                value={currentStatus}
                onChange={(e) => {
                  setCurrentStatus(e.target.value as TicketStatus | '');
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label htmlFor="queue-requested-priority-filter" className="zg-label">
                Req. Priority
              </label>
              <select
                id="queue-requested-priority-filter"
                className="form-select field-editable"
                value={requestedPriority}
                onChange={(e) => {
                  setRequestedPriority(e.target.value as Priority | '');
                  setPage(1);
                }}
              >
                <option value="">All Priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label htmlFor="queue-it-priority-filter" className="zg-label">
                IT Priority
              </label>
              <select
                id="queue-it-priority-filter"
                className="form-select field-editable"
                value={itPriority}
                onChange={(e) => {
                  setItPriority(e.target.value as Priority | '');
                  setPage(1);
                }}
              >
                <option value="">All Priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label htmlFor="queue-owner-filter" className="zg-label">
                Owner
              </label>
              <select
                id="queue-owner-filter"
                className="form-select field-editable"
                value={ownerFilter}
                onChange={(e) => {
                  setOwnerFilter(e.target.value as OwnerFilter);
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="unassigned">Unassigned</option>
                <option value="me">Assigned to Me</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {isLoading && tickets.length === 0 && (
        <div className="py-5">
          <LoadingState message="Loading ticket queue…" />
        </div>
      )}

      {!isLoading && loadError && <ErrorState message={loadError} onRetry={() => setRetryCount((c) => c + 1)} />}

      {!isLoading && !loadError && meta && meta.totalCount === 0 && !hasActiveFilters && (
        <EmptyState message="No tickets in queue." />
      )}

      {!isLoading && !loadError && meta && meta.totalCount === 0 && hasActiveFilters && (
        <NoResultsState
          action={
            <Button variant="secondary" onClick={handleClearFilters}>
              Reset Filters
            </Button>
          }
        />
      )}

      {meta && meta.totalCount > 0 && (
        <>
          {/* Desktop / tablet table */}
          <div className="d-none d-md-block card border-0 shadow-sm">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" data-testid="staff-queue-table">
                <thead>
                  <tr>
                    {SORT_COLUMNS.map(({ field, label }) => (
                      <th key={field} scope="col">
                        <button
                          type="button"
                          className="btn btn-link p-0 fw-semibold text-decoration-none"
                          style={{ color: 'var(--color-text)' }}
                          onClick={() => handleSort(field)}
                          aria-label={`Sort by ${label}`}
                        >
                          {label}
                          {sortIndicator(field)}
                        </button>
                      </th>
                    ))}
                    <th scope="col">Summary</th>
                    <th scope="col">Category</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => openTicket(t.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') openTicket(t.id);
                      }}
                      style={{ cursor: 'pointer' }}
                      data-testid={`queue-row-${t.id}`}
                    >
                      <td className="font-monospace">{t.ticketNumber}</td>
                      <td>{formatDate(t.createdAt)}</td>
                      <td>
                        <Badge kind="priority" value={t.requestedPriority} />
                      </td>
                      <td>
                        <Badge kind="itPriority" value={t.itPriority} />
                      </td>
                      <td>
                        <Badge kind="status" value={t.currentStatus} />
                      </td>
                      <td className="text-truncate" style={{ maxWidth: 240 }} title={t.summary}>
                        {t.summary}
                      </td>
                      <td>{t.category.name}</td>
                      <td>{t.owner?.name ?? 'Unassigned'}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTicket(t.id);
                          }}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="d-md-none d-flex flex-column gap-2">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="card border-0 shadow-sm"
                role="button"
                tabIndex={0}
                onClick={() => openTicket(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openTicket(t.id);
                }}
                data-testid={`queue-card-${t.id}`}
              >
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                    <span className="font-monospace small fw-semibold">{t.ticketNumber}</span>
                    <Badge kind="status" value={t.currentStatus} />
                  </div>
                  <div className="fw-medium mb-2">{t.summary}</div>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    <Badge kind="priority" value={t.requestedPriority} />
                    <Badge kind="itPriority" value={t.itPriority} />
                    <span className="badge bg-light text-dark border">{t.category.name}</span>
                  </div>
                  <div className="small text-muted">
                    Owner: {t.owner?.name ?? 'Unassigned'} · Created {formatDate(t.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3 mt-4">
            <div className="d-flex align-items-center gap-2">
              <label htmlFor="queue-page-size" className="zg-label mb-0">
                Rows per page
              </label>
              <select
                id="queue-page-size"
                className="form-select field-editable"
                style={{ width: 'auto' }}
                value={pageSize}
                onChange={handlePageSizeChange}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            {meta.totalPages > 1 && (
              <nav aria-label="Ticket Queue pagination">
                <ul className="pagination mb-0 flex-wrap justify-content-center">
                  <li className={`page-item ${meta.page <= 1 ? 'disabled' : ''}`}>
                    <button
                      type="button"
                      className="page-link"
                      disabled={meta.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                  </li>
                  {getPaginationItems(meta.page, meta.totalPages).map((item, idx) =>
                    item === '...' ? (
                      <li key={`ellipsis-${idx}`} className="page-item disabled" aria-hidden="true">
                        <span className="page-link">…</span>
                      </li>
                    ) : (
                      <li key={item} className={`page-item ${item === meta.page ? 'active' : ''}`}>
                        <button
                          type="button"
                          className="page-link"
                          aria-current={item === meta.page ? 'page' : undefined}
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </button>
                      </li>
                    ),
                  )}
                  <li className={`page-item ${meta.page >= meta.totalPages ? 'disabled' : ''}`}>
                    <button
                      type="button"
                      className="page-link"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                    >
                      Next
                    </button>
                  </li>
                </ul>
              </nav>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default StaffTicketQueue;
