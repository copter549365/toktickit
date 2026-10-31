/**
 * client/tests/lab-04/DrillDownFilters.test.tsx
 *
 * Tests: UI-L4-11 (docs/lab-04/tests.md §2.6; FR-16, AC-22, ui-spec §7).
 * My Tickets, the Ticket Queue, and User Management read their filters from the URL, send them to
 * the API, show them in the controls, write changes back to the URL, and show a dismissible
 * "Filtered from Dashboard" chip. User Management has the D-18 `isActive` filter.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation, Link } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { MyTickets } from '../../src/screens/MyTickets';
import { StaffTicketQueue } from '../../src/screens/StaffTicketQueue';
import { UserManagement } from '../../src/screens/UserManagement';

const requesterUser = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com', role: 'REQUESTER', mustChangePassword: false };

function ticket(id: number, currentStatus = 'IN_PROGRESS') {
  return {
    id,
    ticketNumber: `TKT-2026-${String(id).padStart(6, '0')}`,
    summary: `Ticket ${id}`,
    category: { id: 2, name: 'Hardware' },
    relatedSystem: { id: 1, name: 'Corporate Laptop' },
    requestedPriority: 'MEDIUM',
    itPriority: 'MEDIUM',
    currentStatus,
    requesterResolvedIndicator: false,
    owner: null,
    createdAt: '2026-10-20T09:14:00.000Z',
    updatedAt: '2026-10-21T09:14:00.000Z',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function stub(totalCount = 3) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/auth/me')) return jsonResponse({ user: requesterUser });
    if (url.includes('/api/categories')) return jsonResponse([{ id: 2, name: 'Hardware' }]);
    if (url.includes('/api/tickets')) {
      const data = Array.from({ length: Math.min(totalCount, 10) }, (_, i) => ticket(i + 1));
      return jsonResponse({ data, meta: { page: 1, pageSize: 10, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / 10)) } });
    }
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function ticketCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.includes('/api/tickets'))
    .map((u) => new URL(u).searchParams);
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAt(entry: string | { pathname: string; search: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/tickets"
            element={
              <>
                <MyTickets />
                <LocationProbe />
                <Link to="/tickets">Nav My Tickets</Link>
              </>
            }
          />
          <Route path="/tickets/:id" element={<div>Ticket Detail Screen</div>} />
          <Route path="/tickets/new" element={<div>Create Ticket Screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const location = () => screen.getByTestId('location').textContent;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UI-L4-11: My Tickets URL-driven filters (FR-16, AC-22)', () => {
  it('initializes currentStatus from the URL, sends it, and shows it in the control', async () => {
    const fetchMock = stub();
    renderAt('/tickets?currentStatus=WAITING_FOR_REQUESTER');
    await waitFor(() => expect(ticketCalls(fetchMock).length).toBeGreaterThan(0));
    expect(ticketCalls(fetchMock)[0].get('currentStatus')).toBe('WAITING_FOR_REQUESTER');
    expect(screen.getByLabelText('Current Status')).toHaveValue('WAITING_FOR_REQUESTER');
  });

  it('initializes statusGroup=active and shows "Status group: Active" in the status control', async () => {
    const fetchMock = stub();
    renderAt('/tickets?statusGroup=active');
    await waitFor(() => expect(ticketCalls(fetchMock).length).toBeGreaterThan(0));
    const params = ticketCalls(fetchMock)[0];
    expect(params.get('statusGroup')).toBe('active');
    expect(params.get('currentStatus')).toBeNull();
    const select = screen.getByLabelText('Current Status') as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent).toBe('Status group: Active');
  });

  it('initializes sortBy=updatedAt&sortOrder=desc, marks Last Updated as the sorted column', async () => {
    const fetchMock = stub();
    renderAt('/tickets?sortBy=updatedAt&sortOrder=desc');
    await waitFor(() => expect(ticketCalls(fetchMock).length).toBeGreaterThan(0));
    expect(ticketCalls(fetchMock)[0].get('sortBy')).toBe('updatedAt');
    expect(ticketCalls(fetchMock)[0].get('sortOrder')).toBe('desc');
    const header = await screen.findByRole('columnheader', { name: /Last Updated/ });
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('ignores invalid URL values instead of sending them', async () => {
    const fetchMock = stub();
    renderAt('/tickets?currentStatus=BOGUS&sortBy=resolvedAt&statusGroup=closed');
    await waitFor(() => expect(ticketCalls(fetchMock).length).toBeGreaterThan(0));
    const params = ticketCalls(fetchMock)[0];
    expect(params.get('currentStatus')).toBeNull();
    expect(params.get('statusGroup')).toBeNull();
    expect(params.get('sortBy')).toBe('createdAt');
    expect(screen.getByLabelText('Current Status')).toHaveValue('');
  });

  it('writes a filter change back to the URL', async () => {
    stub();
    renderAt('/tickets');
    await screen.findByTestId('my-tickets-table');
    fireEvent.change(screen.getByLabelText('Current Status'), { target: { value: 'RESOLVED' } });
    await waitFor(() => expect(location()).toBe('/tickets?currentStatus=RESOLVED'));
    fireEvent.change(screen.getByLabelText('Current Status'), { target: { value: 'group:active' } });
    await waitFor(() => expect(location()).toBe('/tickets?statusGroup=active'));
    fireEvent.change(screen.getByLabelText('Current Status'), { target: { value: '' } });
    await waitFor(() => expect(location()).toBe('/tickets'));
  });

  it('shows the total so the list can be compared with the card value', async () => {
    stub(23);
    renderAt('/tickets?statusGroup=active');
    expect(await screen.findByText('23 tickets')).toBeInTheDocument();
  });

  it('a "Filtered from Dashboard" chip appears after a drill-down; Clear filters empties the URL', async () => {
    const fetchMock = stub();
    renderAt({ pathname: '/tickets', search: '?currentStatus=RESOLVED', state: { fromDashboard: true } });
    const chip = await screen.findByRole('status', { name: 'Filtered from Dashboard' });
    fireEvent.click(within(chip).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(location()).toBe('/tickets'));
    expect(screen.queryByRole('status', { name: 'Filtered from Dashboard' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current Status')).toHaveValue('');
    await waitFor(() => expect(ticketCalls(fetchMock).at(-1)!.get('currentStatus')).toBeNull());
  });

  it('the chip can be dismissed without clearing the filters', async () => {
    stub();
    renderAt({ pathname: '/tickets', search: '?currentStatus=RESOLVED', state: { fromDashboard: true } });
    const chip = await screen.findByRole('status', { name: 'Filtered from Dashboard' });
    fireEvent.click(within(chip).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status', { name: 'Filtered from Dashboard' })).not.toBeInTheDocument();
    expect(location()).toBe('/tickets?currentStatus=RESOLVED');
  });

  it('no chip without a drill-down', async () => {
    stub();
    renderAt('/tickets?currentStatus=RESOLVED');
    await screen.findByTestId('my-tickets-table');
    expect(screen.queryByRole('status', { name: 'Filtered from Dashboard' })).not.toBeInTheDocument();
  });

  it('navigating to /tickets from the nav while filtered resets the filters', async () => {
    const fetchMock = stub();
    renderAt('/tickets?currentStatus=RESOLVED');
    await screen.findByTestId('my-tickets-table');
    fireEvent.click(screen.getByRole('link', { name: 'Nav My Tickets' }));
    await waitFor(() => expect(screen.getByLabelText('Current Status')).toHaveValue(''));
    await waitFor(() => expect(ticketCalls(fetchMock).at(-1)!.get('currentStatus')).toBeNull());
    expect(location()).toBe('/tickets');
  });
});

// ---------------------------------------------------------------------------
// Ticket Queue and User Management (Issue 7)
// ---------------------------------------------------------------------------

const staffUser = { id: 5, name: 'Michael Brown', email: 'michael.brown@toktickit.com', role: 'IT_STAFF', mustChangePassword: false };
const adminUser = { id: 9, name: 'John Smith', email: 'john.smith@toktickit.com', role: 'ADMINISTRATOR', mustChangePassword: false };

function queueTicket(id: number) {
  return {
    id,
    ticketNumber: `TKT-2026-${String(id).padStart(6, '0')}`,
    createdAt: '2026-10-20T09:14:00.000Z',
    summary: `Queue ticket ${id}`,
    category: { id: 2, name: 'Hardware' },
    requestedPriority: 'MEDIUM',
    itPriority: 'HIGH',
    currentStatus: 'IN_PROGRESS',
    requester: { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com' },
    owner: null,
    requesterResolvedIndicator: false,
    updatedAt: '2026-10-21T09:14:00.000Z',
  };
}

function stubQueue(totalCount = 3) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/auth/me')) return jsonResponse({ user: staffUser });
    if (url.includes('/api/categories')) return jsonResponse([{ id: 2, name: 'Hardware' }]);
    if (url.includes('/api/staff/tickets')) {
      const data = Array.from({ length: Math.min(totalCount, 10) }, (_, i) => queueTicket(i + 1));
      return jsonResponse({ data, meta: { page: 1, pageSize: 10, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / 10)) } });
    }
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const queueCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.includes('/api/staff/tickets'))
    .map((u) => new URL(u).searchParams);

function renderQueueAt(entry: string | { pathname: string; search: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/staff/tickets"
            element={
              <>
                <StaffTicketQueue />
                <LocationProbe />
                <Link to="/staff/tickets">Nav Queue</Link>
              </>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-L4-11: Ticket Queue URL-driven filters (FR-16, AC-22)', () => {
  it('initializes the "Unassigned / active" drill-down and sends it unchanged', async () => {
    const fetchMock = stubQueue();
    renderQueueAt('/staff/tickets?ticketOwnerId=unassigned&statusGroup=active');
    await waitFor(() => expect(queueCalls(fetchMock).length).toBeGreaterThan(0));
    const params = queueCalls(fetchMock)[0];
    expect(params.get('ticketOwnerId')).toBe('unassigned');
    expect(params.get('statusGroup')).toBe('active');
    expect(screen.getByLabelText('Owner')).toHaveValue('unassigned');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Status group: Active');
  });

  it('reads "My Assigned" (ticketOwnerId = my id) as the "Assigned to Me" option and keeps the URL', async () => {
    const fetchMock = stubQueue();
    renderQueueAt('/staff/tickets?ticketOwnerId=5&statusGroup=active');
    await waitFor(() => expect(queueCalls(fetchMock).length).toBeGreaterThan(0));
    expect(queueCalls(fetchMock)[0].get('ticketOwnerId')).toBe('5');
    expect(screen.getByLabelText('Owner')).toHaveValue('me');
    await screen.findByText(/Showing \d+ of 3 tickets/);
    expect(location()).toBe('/staff/tickets?ticketOwnerId=5&statusGroup=active');
  });

  it('reads requesterResolvedIndicator=true into the "Requester says resolved" checkbox', async () => {
    const fetchMock = stubQueue();
    renderQueueAt('/staff/tickets?statusGroup=active&requesterResolvedIndicator=true');
    await waitFor(() => expect(queueCalls(fetchMock).length).toBeGreaterThan(0));
    expect(queueCalls(fetchMock)[0].get('requesterResolvedIndicator')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Requester says resolved' })).toBeChecked();
  });

  it('reads itPriority and the Urgent sort from the URL', async () => {
    const fetchMock = stubQueue();
    renderQueueAt('/staff/tickets?itPriority=HIGH&statusGroup=active&sortBy=createdAt&sortOrder=asc');
    await waitFor(() => expect(queueCalls(fetchMock).length).toBeGreaterThan(0));
    const params = queueCalls(fetchMock)[0];
    expect(params.get('itPriority')).toBe('HIGH');
    expect(params.get('sortBy')).toBe('createdAt');
    expect(params.get('sortOrder')).toBe('asc');
    expect(screen.getByLabelText('IT Priority')).toHaveValue('HIGH');
  });

  it('writes filter changes back to the URL', async () => {
    stubQueue();
    renderQueueAt('/staff/tickets');
    await screen.findByText(/Showing \d+ of 3 tickets/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Requester says resolved' }));
    await waitFor(() => expect(location()).toBe('/staff/tickets?requesterResolvedIndicator=true'));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'group:active' } });
    await waitFor(() => expect(location()).toBe('/staff/tickets?statusGroup=active&requesterResolvedIndicator=true'));
  });

  it('shows the "Filtered from Dashboard" chip after a drill-down; Clear filters empties the URL', async () => {
    stubQueue();
    renderQueueAt({ pathname: '/staff/tickets', search: '?currentStatus=NEW', state: { fromDashboard: true } });
    const chip = await screen.findByRole('status', { name: 'Filtered from Dashboard' });
    fireEvent.click(within(chip).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(location()).toBe('/staff/tickets'));
    expect(screen.getByLabelText('Status')).toHaveValue('');
  });

  it('the nav link resets the filters', async () => {
    const fetchMock = stubQueue();
    renderQueueAt('/staff/tickets?currentStatus=NEW');
    await screen.findByText(/Showing \d+ of 3 tickets/);
    fireEvent.click(screen.getByRole('link', { name: 'Nav Queue' }));
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue(''));
    await waitFor(() => expect(queueCalls(fetchMock).at(-1)!.get('currentStatus')).toBeNull());
  });
});

function adminUserRow(id: number, role: string, isActive: boolean) {
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@toktickit.com`,
    role,
    isActive,
    mustChangePassword: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function stubUsers() {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/auth/me')) return jsonResponse({ user: adminUser });
    if (url.includes('/api/admin/users')) return jsonResponse([adminUserRow(1, 'REQUESTER', true), adminUserRow(2, 'REQUESTER', true)]);
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The list requests only; the separate unfiltered Administrator count request is skipped. */
const userListCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.includes('/api/admin/users') && !u.endsWith('?role=ADMINISTRATOR'))
    .map((u) => new URL(u).searchParams);

function renderUsersAt(entry: string | { pathname: string; search: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/admin/users"
            element={
              <>
                <UserManagement />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-L4-11: User Management URL-driven filters (FR-16, D-18)', () => {
  it('initializes role and isActive from the URL, sends both, and shows them in the controls', async () => {
    const fetchMock = stubUsers();
    renderUsersAt({ pathname: '/admin/users', search: '?role=REQUESTER&isActive=true', state: { fromDashboard: true } });
    await waitFor(() => expect(userListCalls(fetchMock).length).toBeGreaterThan(0));
    const params = userListCalls(fetchMock)[0];
    expect(params.get('role')).toBe('REQUESTER');
    expect(params.get('isActive')).toBe('true');
    expect(screen.getByLabelText('Role')).toHaveValue('REQUESTER');
    expect(screen.getByLabelText('Account Status')).toHaveValue('true');
    expect(await screen.findByRole('status', { name: 'Filtered from Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('2 users')).toBeInTheDocument();
  });

  it('isActive=false alone selects "Inactive" and sends it', async () => {
    const fetchMock = stubUsers();
    renderUsersAt('/admin/users?isActive=false');
    await waitFor(() => expect(userListCalls(fetchMock).length).toBeGreaterThan(0));
    expect(userListCalls(fetchMock)[0].get('isActive')).toBe('false');
    expect(userListCalls(fetchMock)[0].get('role')).toBeNull();
    expect(screen.getByLabelText('Account Status')).toHaveValue('false');
  });

  it('writes filter changes to the URL, and Clear Filters empties it', async () => {
    stubUsers();
    renderUsersAt('/admin/users');
    await screen.findByText('2 users');
    fireEvent.change(screen.getByLabelText('Account Status'), { target: { value: 'false' } });
    await waitFor(() => expect(location()).toBe('/admin/users?isActive=false'));
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'IT_STAFF' } });
    await waitFor(() => expect(location()).toBe('/admin/users?role=IT_STAFF&isActive=false'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    await waitFor(() => expect(location()).toBe('/admin/users'));
  });

  it('ignores invalid URL values', async () => {
    const fetchMock = stubUsers();
    renderUsersAt('/admin/users?role=ROOT&isActive=maybe');
    await waitFor(() => expect(userListCalls(fetchMock).length).toBeGreaterThan(0));
    expect(userListCalls(fetchMock)[0].get('role')).toBeNull();
    expect(userListCalls(fetchMock)[0].get('isActive')).toBeNull();
    expect(screen.getByLabelText('Account Status')).toHaveValue('');
  });
});
