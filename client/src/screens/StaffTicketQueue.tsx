import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchCategories } from '../api/categories';
import { fetchStaffQueue, ApiError } from '../api/staffTickets';
import { Button } from '../components/Button';
import { Badge, RequesterSaysResolvedPill } from '../components/Badge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { NoResultsState } from '../components/NoResultsState';
import type { Category } from '../types/category';
import type { Priority, TicketStatus } from '../types/ticket';
import type { OwnerFilter, StaffQueueSortField, StaffTicketListItem, StaffQueueListMeta } from '../types/staffTicket';
import { formatDate } from '../utils/formatDate';
import { DrillDownChip } from '../components/DrillDownChip';
import { useInitialUrlFilters, useUrlFilterSync } from '../hooks/useUrlFilterSync';

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

const SORT_FIELDS: StaffQueueSortField[] = ['createdAt', 'ticketNumber', 'requestedPriority', 'itPriority', 'currentStatus', 'updatedAt'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH'];
/** Status-filter option value for `statusGroup=active` (ui-spec §7). */
const ACTIVE_GROUP_OPTION = 'group:active';

interface QueueFilters {
  search: string;
  categoryId: string;
  requestedPriority: Priority | '';
  itPriority: Priority | '';
  currentStatus: TicketStatus | '';
  statusGroup: 'active' | '';
  /** '' for all owners, 'unassigned', or a staff user id ("Assigned to Me" is the caller's id). */
  ownerId: string;
  requesterResolvedIndicator: boolean;
  sortBy: StaffQueueSortField;
  sortOrder: 'asc' | 'desc';
  page: number;
  pageSize: 10 | 20 | 50;
}

/** FR-16: the URL form of the filters. Invalid values are dropped, as the server does. */
function readQueueFilters(params: URLSearchParams): QueueFilters {
  const status = params.get('currentStatus');
  const currentStatus = STATUS_OPTIONS.some((s) => s.value === status) ? (status as TicketStatus) : '';
  const pick = (key: string) => {
    const value = params.get(key);
    return PRIORITIES.includes(value as Priority) ? (value as Priority) : '';
  };
  const categoryId = params.get('categoryId') ?? '';
  const owner = params.get('ticketOwnerId') ?? '';
  const sortBy = params.get('sortBy');
  const sortOrder = params.get('sortOrder');
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  return {
    search: (params.get('search') ?? '').trim(),
    categoryId: /^[1-9]\d*$/.test(categoryId) ? categoryId : '',
    requestedPriority: pick('requestedPriority'),
    itPriority: pick('itPriority'),
    currentStatus,
    statusGroup: !currentStatus && params.get('statusGroup') === 'active' ? 'active' : '',
    ownerId: owner === 'unassigned' || /^[1-9]\d*$/.test(owner) ? owner : '',
    requesterResolvedIndicator: params.get('requesterResolvedIndicator') === 'true',
    sortBy: SORT_FIELDS.includes(sortBy as StaffQueueSortField) ? (sortBy as StaffQueueSortField) : DEFAULT_SORT_BY,
    sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : DEFAULT_SORT_ORDER,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize) ? (pageSize as 10 | 20 | 50) : 10,
  };
}

/** Writes only non-default values, in the same order as the dashboard drill-down queries. */
function queueFiltersToQuery(f: QueueFilters): string {
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.categoryId) params.set('categoryId', f.categoryId);
  if (f.requestedPriority) params.set('requestedPriority', f.requestedPriority);
  if (f.itPriority) params.set('itPriority', f.itPriority);
  if (f.ownerId) params.set('ticketOwnerId', f.ownerId);
  if (f.currentStatus) params.set('currentStatus', f.currentStatus);
  else if (f.statusGroup) params.set('statusGroup', f.statusGroup);
  if (f.requesterResolvedIndicator) params.set('requesterResolvedIndicator', 'true');
  if (f.sortBy !== DEFAULT_SORT_BY || f.sortOrder !== DEFAULT_SORT_ORDER) {
    params.set('sortBy', f.sortBy);
    params.set('sortOrder', f.sortOrder);
  }
  if (f.page > 1) params.set('page', String(f.page));
  if (f.pageSize !== 10) params.set('pageSize', String(f.pageSize));
  return params.toString();
}

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

  const { filters: initial, fromDashboard } = useInitialUrlFilters(readQueueFilters);
  const [searchInput, setSearchInput] = useState(initial.search);
  const [search, setSearch] = useState(initial.search);
  const [categoryId, setCategoryId] = useState<string>(initial.categoryId);
  const [requestedPriority, setRequestedPriority] = useState<Priority | ''>(initial.requestedPriority);
  const [itPriority, setItPriority] = useState<Priority | ''>(initial.itPriority);
  const [currentStatus, setCurrentStatus] = useState<TicketStatus | ''>(initial.currentStatus);
  const [statusGroup, setStatusGroup] = useState<'active' | ''>(initial.statusGroup);
  const [ownerId, setOwnerId] = useState(initial.ownerId);
  const [requesterResolvedIndicator, setRequesterResolvedIndicator] = useState(initial.requesterResolvedIndicator);
  const [sortBy, setSortBy] = useState<StaffQueueSortField>(initial.sortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initial.sortOrder);
  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(initial.pageSize);
  const [retryCount, setRetryCount] = useState(0);
  const [showDashboardChip, setShowDashboardChip] = useState(fromDashboard);

  const [tickets, setTickets] = useState<StaffTicketListItem[]>([]);
  const [meta, setMeta] = useState<StaffQueueListMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasActiveFilters = Boolean(
    search || categoryId || requestedPriority || itPriority || currentStatus || statusGroup || ownerId || requesterResolvedIndicator,
  );

  // The Owner control shows the caller's own id as "Assigned to Me" (the My Assigned drill-down).
  const ownerFilter: OwnerFilter | 'other' =
    ownerId === '' ? 'all' : ownerId === 'unassigned' ? 'unassigned' : ownerId === String(user?.id) ? 'me' : 'other';

  useUrlFilterSync(
    queueFiltersToQuery({
      search,
      categoryId,
      requestedPriority,
      itPriority,
      currentStatus,
      statusGroup,
      ownerId,
      requesterResolvedIndicator,
      sortBy,
      sortOrder,
      page,
      pageSize,
    }),
    (params, openedFromDashboard) => {
      const f = readQueueFilters(params);
      setSearchInput(f.search);
      setSearch(f.search);
      setCategoryId(f.categoryId);
      setRequestedPriority(f.requestedPriority);
      setItPriority(f.itPriority);
      setCurrentStatus(f.currentStatus);
      setStatusGroup(f.statusGroup);
      setOwnerId(f.ownerId);
      setRequesterResolvedIndicator(f.requesterResolvedIndicator);
      setSortBy(f.sortBy);
      setSortOrder(f.sortOrder);
      setPage(f.page);
      setPageSize(f.pageSize);
      setShowDashboardChip(openedFromDashboard);
    },
  );

  // Only when the text actually changed; otherwise the mount-time timer resets a page the user
  // has already moved to (same fix as MyTickets, Issue 8).
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

    const ticketOwnerId: number | 'unassigned' | undefined =
      ownerId === 'unassigned' ? 'unassigned' : ownerId ? Number(ownerId) : undefined;

    fetchStaffQueue(
      {
        search: search || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        requestedPriority: requestedPriority || undefined,
        itPriority: itPriority || undefined,
        currentStatus: currentStatus || undefined,
        statusGroup: statusGroup || undefined,
        requesterResolvedIndicator: requesterResolvedIndicator || undefined,
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
  }, [user, search, categoryId, requestedPriority, itPriority, currentStatus, statusGroup, requesterResolvedIndicator, ownerId, sortBy, sortOrder, page, pageSize, retryCount]);

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
    setStatusGroup('');
    setOwnerId('');
    setRequesterResolvedIndicator(false);
    setSortBy(DEFAULT_SORT_BY);
    setSortOrder(DEFAULT_SORT_ORDER);
    setPage(1);
    setShowDashboardChip(false);
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

      {showDashboardChip && (
        <DrillDownChip onClear={handleClearFilters} onDismiss={() => setShowDashboardChip(false)} />
      )}

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
                value={currentStatus || (statusGroup ? ACTIVE_GROUP_OPTION : '')}
                onChange={(e) => {
                  if (e.target.value === ACTIVE_GROUP_OPTION) {
                    setCurrentStatus('');
                    setStatusGroup('active');
                  } else {
                    setCurrentStatus(e.target.value as TicketStatus | '');
                    setStatusGroup('');
                  }
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                <option value={ACTIVE_GROUP_OPTION}>Status group: Active</option>
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
                  const choice = e.target.value as OwnerFilter;
                  setOwnerId(choice === 'all' ? '' : choice === 'me' ? String(user?.id ?? '') : 'unassigned');
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="unassigned">Unassigned</option>
                <option value="me">Assigned to Me</option>
                {ownerFilter === 'other' && (
                  <option value="other" disabled>
                    Another staff member
                  </option>
                )}
              </select>
            </div>
            <div className="col-12 col-md-auto">
              <div className="form-check mt-md-2">
                <input
                  id="queue-requester-resolved-filter"
                  type="checkbox"
                  className="form-check-input"
                  checked={requesterResolvedIndicator}
                  onChange={(e) => {
                    setRequesterResolvedIndicator(e.target.checked);
                    setPage(1);
                  }}
                />
                <label htmlFor="queue-requester-resolved-filter" className="form-check-label">
                  Requester says resolved
                </label>
              </div>
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
                        <div className="d-flex flex-column align-items-start gap-1">
                          <Badge kind="status" value={t.currentStatus} />
                          {t.requesterResolvedIndicator && <RequesterSaysResolvedPill />}
                        </div>
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
                    {t.requesterResolvedIndicator && <RequesterSaysResolvedPill />}
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
