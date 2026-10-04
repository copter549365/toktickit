import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchCategories } from '../api/categories';
import { fetchMyTickets, ApiError } from '../api/tickets';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { NoResultsState } from '../components/NoResultsState';
import type { Category } from '../types/category';
import type {
  Priority,
  SortOrder,
  TicketListItem,
  TicketListMeta,
  TicketSortField,
  TicketStatus,
} from '../types/ticket';
import { formatDate } from '../utils/formatDate';

const PAGE_SIZE = 10;
const DEFAULT_SORT_BY: TicketSortField = 'createdAt';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';

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

const SORT_COLUMNS: { field: TicketSortField; label: string }[] = [
  { field: 'ticketNumber', label: 'Ticket No.' },
  { field: 'createdAt', label: 'Created Date' },
  { field: 'summary', label: 'Summary' },
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

export function MyTickets() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [requestedPriority, setRequestedPriority] = useState<Priority | ''>('');
  const [currentStatus, setCurrentStatus] = useState<TicketStatus | ''>('');
  const [sortBy, setSortBy] = useState<TicketSortField>(DEFAULT_SORT_BY);
  const [sortOrder, setSortOrder] = useState<SortOrder>(DEFAULT_SORT_ORDER);
  const [page, setPage] = useState(1);
  const [retryCount, setRetryCount] = useState(0);

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [meta, setMeta] = useState<TicketListMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasActiveFilters = Boolean(search || categoryId || requestedPriority || currentStatus);

  // Debounce the free-text search box so typing doesn't fire a request per keystroke.
  // Only when the text actually changed: an unconditional timer also fired on mount and reset
  // the page to 1 ~300ms later, bouncing a user who had already paged forward (Issue 8, UI-11).
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) return;
    const timer = setTimeout(() => {
      setSearch(trimmed);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

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

    fetchMyTickets(
      {
        search: search || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        requestedPriority: requestedPriority || undefined,
        currentStatus: currentStatus || undefined,
        sortBy,
        sortOrder,
        page,
        pageSize: PAGE_SIZE,
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
            setLoadError('Unable to load your tickets. Please try again.');
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
  }, [user, search, categoryId, requestedPriority, currentStatus, sortBy, sortOrder, page, retryCount]);

  const handleSort = (field: TicketSortField) => {
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
    setCurrentStatus('');
    setSortBy(DEFAULT_SORT_BY);
    setSortOrder(DEFAULT_SORT_ORDER);
    setPage(1);
  };

  const handleCategoryChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setCategoryId(e.target.value);
    setPage(1);
  };

  const handlePriorityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setRequestedPriority(e.target.value as Priority | '');
    setPage(1);
  };

  const handleStatusChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setCurrentStatus(e.target.value as TicketStatus | '');
    setPage(1);
  };

  const openTicket = (id: number) => navigate(`/tickets/${id}`);

  const sortIndicator = (field: TicketSortField) => {
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
            My Tickets
          </h1>
          <p className="text-muted small mb-0">Tickets you have submitted, scoped to {user?.name}.</p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="tertiary" onClick={handleClearFilters} disabled={!hasActiveFilters}>
            Clear Filters
          </Button>
          <Button variant="primary" onClick={() => navigate('/tickets/new')}>
            Create Ticket
          </Button>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-4">
              <label htmlFor="tickets-search-input" className="zg-label">
                Search
              </label>
              <input
                id="tickets-search-input"
                type="search"
                className="form-control field-editable"
                placeholder="Search by ticket number or summary"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-3">
              <label htmlFor="tickets-category-filter" className="zg-label">
                Category
              </label>
              <select
                id="tickets-category-filter"
                className="form-select field-editable"
                value={categoryId}
                onChange={handleCategoryChange}
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
              <label htmlFor="tickets-priority-filter" className="zg-label">
                Requested Priority
              </label>
              <select
                id="tickets-priority-filter"
                className="form-select field-editable"
                value={requestedPriority}
                onChange={handlePriorityChange}
              >
                <option value="">All Priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label htmlFor="tickets-status-filter" className="zg-label">
                Current Status
              </label>
              <select
                id="tickets-status-filter"
                className="form-select field-editable"
                value={currentStatus}
                onChange={handleStatusChange}
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {isLoading && tickets.length === 0 && (
        <div className="py-5">
          <LoadingState message="Loading your tickets…" />
        </div>
      )}

      {!isLoading && loadError && <ErrorState message={loadError} onRetry={() => setRetryCount((c) => c + 1)} />}

      {!isLoading && !loadError && meta && meta.totalCount === 0 && !hasActiveFilters && (
        <EmptyState
          action={
            <Button variant="primary" onClick={() => navigate('/tickets/new')}>
              Create Ticket
            </Button>
          }
        />
      )}

      {!isLoading && !loadError && meta && meta.totalCount === 0 && hasActiveFilters && (
        <NoResultsState
          action={
            <Button variant="secondary" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          }
        />
      )}

      {meta && meta.totalCount > 0 && (
        <>
          {/* Desktop / tablet table (ui-spec.md §4.4) */}
          <div className="d-none d-md-block card border-0 shadow-sm">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" data-testid="my-tickets-table">
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
                    <th scope="col">Category</th>
                    <th scope="col">Requested Priority</th>
                    <th scope="col">Current Status</th>
                    <th scope="col">Last Updated</th>
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
                      data-testid={`ticket-row-${t.id}`}
                    >
                      <td className="font-monospace">{t.ticketNumber}</td>
                      <td>{formatDate(t.createdAt)}</td>
                      <td className="text-truncate" style={{ maxWidth: 280 }} title={t.summary}>
                        {t.summary}
                      </td>
                      <td>{t.category.name}</td>
                      <td>
                        <Badge kind="priority" value={t.requestedPriority} />
                      </td>
                      <td>
                        <Badge kind="status" value={t.currentStatus} />
                      </td>
                      <td>{formatDate(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card layout (ui-spec.md §4.4) */}
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
                data-testid={`ticket-card-${t.id}`}
              >
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                    <span className="font-monospace small fw-semibold">{t.ticketNumber}</span>
                    <Badge kind="status" value={t.currentStatus} />
                  </div>
                  <div className="fw-medium mb-2">{t.summary}</div>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    <Badge kind="priority" value={t.requestedPriority} />
                    <span className="badge bg-light text-dark border">{t.category.name}</span>
                  </div>
                  <div className="small text-muted">
                    Created {formatDate(t.createdAt)} · Updated {formatDate(t.updatedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination (ui-spec.md §4.4) */}
          {meta.totalPages > 1 && (
            <nav aria-label="My Tickets pagination" className="d-flex justify-content-center mt-4">
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
        </>
      )}
    </div>
  );
}

export default MyTickets;
