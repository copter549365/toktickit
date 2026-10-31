/**
 * client/tests/lab-04/StaffDashboard.test.tsx
 *
 * Tests: UI-L4-08 and UI-L4-09 (docs/lab-04/tests.md §2.6) — the IT Staff / Administrator
 * Dashboard: feedback states (loading, safe failure with Retry, forbidden), status, workload and
 * priority cards built from `drillDown`, My Open Actions rows linking to `#actions-taken`, the
 * Urgent and Recently Updated lists, and the User Accounts row only when `userAccounts` is set.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { StaffDashboard } from '../../src/screens/StaffDashboard';

const staffUser = { id: 5, name: 'Michael Brown', email: 'michael.brown@toktickit.com', role: 'IT_STAFF', mustChangePassword: false };
const adminUser = { id: 9, name: 'John Smith', email: 'john.smith@toktickit.com', role: 'ADMINISTRATOR', mustChangePassword: false };

const NOW = new Date('2026-11-03T05:10:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function ticketItem(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ticketNumber: `TKT-2026-${String(id).padStart(6, '0')}`,
    summary: `Ticket summary ${id}`,
    currentStatus: 'IN_PROGRESS',
    itPriority: 'HIGH',
    owner: { id: 5, name: 'Michael Brown' },
    createdAt: daysAgo(3),
    updatedAt: NOW.toISOString(),
    resolvedAt: null,
    requesterResolvedIndicator: false,
    ...overrides,
  };
}

const q = (query: Record<string, string>) => ({ path: '/staff/tickets', query });

function makeDashboard(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: NOW.toISOString(),
    displayTimeZone: 'Asia/Bangkok',
    statusCards: [
      { key: 'NEW', label: 'New', value: 4, drillDown: q({ currentStatus: 'NEW' }) },
      { key: 'OPEN', label: 'Open', value: 3, drillDown: q({ currentStatus: 'OPEN' }) },
      { key: 'IN_PROGRESS', label: 'In Progress', value: 5, drillDown: q({ currentStatus: 'IN_PROGRESS' }) },
      { key: 'WAITING_FOR_REQUESTER', label: 'Waiting for Requester', value: 2, drillDown: q({ currentStatus: 'WAITING_FOR_REQUESTER' }) },
      { key: 'REOPENED', label: 'Reopened', value: 0, drillDown: q({ currentStatus: 'REOPENED' }) },
      { key: 'RESOLVED', label: 'Resolved', value: 2, drillDown: q({ currentStatus: 'RESOLVED' }) },
    ],
    workloadCards: [
      { key: 'unassignedActive', label: 'Unassigned', value: 3, drillDown: q({ ticketOwnerId: 'unassigned', statusGroup: 'active' }) },
      { key: 'myActive', label: 'My Assigned', value: 4, drillDown: q({ ticketOwnerId: '5', statusGroup: 'active' }) },
      { key: 'requesterMarkedResolved', label: 'Marked Resolved by Requester', value: 1, drillDown: q({ statusGroup: 'active', requesterResolvedIndicator: 'true' }) },
      { key: 'myOpenActions', label: 'My Open Actions', value: 2, drillDown: null },
    ],
    priorityCards: [
      { key: 'LOW', label: 'Low', value: 4, drillDown: q({ itPriority: 'LOW', statusGroup: 'active' }) },
      { key: 'MEDIUM', label: 'Medium', value: 6, drillDown: q({ itPriority: 'MEDIUM', statusGroup: 'active' }) },
      { key: 'HIGH', label: 'High', value: 5, drillDown: q({ itPriority: 'HIGH', statusGroup: 'active' }) },
    ],
    lists: {
      myOpenActions: {
        items: [
          { actionId: 44, ticketId: 12, ticketNumber: 'TKT-2026-000012', ticketSummary: 'VPN disconnects', description: 'Collect VPN client logs', status: 'PLANNED', actionAt: '2026-11-02T02:00:00.000Z', followUpRequired: false },
          { actionId: 45, ticketId: 13, ticketNumber: 'TKT-2026-000013', ticketSummary: 'Printer jam', description: 'Replace the fuser', status: 'IN_PROGRESS', actionAt: '2026-11-02T03:00:00.000Z', followUpRequired: true },
        ],
      },
      urgent: {
        items: [ticketItem(21), ticketItem(22, { owner: null, createdAt: daysAgo(0.2) })],
        viewAll: q({ itPriority: 'HIGH', statusGroup: 'active', sortBy: 'createdAt', sortOrder: 'asc' }),
      },
      recentlyUpdated: {
        items: [ticketItem(31, { requesterResolvedIndicator: true, currentStatus: 'WAITING_FOR_REQUESTER' })],
        viewAll: q({ sortBy: 'updatedAt', sortOrder: 'desc' }),
      },
    },
    userAccounts: null,
    ...overrides,
  };
}

const userAccounts = [
  { key: 'activeRequesters', label: 'Active Requesters', value: 5, drillDown: { path: '/admin/users', query: { role: 'REQUESTER', isActive: 'true' } } },
  { key: 'activeItStaff', label: 'Active IT Staff', value: 4, drillDown: { path: '/admin/users', query: { role: 'IT_STAFF', isActive: 'true' } } },
  { key: 'activeAdministrators', label: 'Active Administrators', value: 1, drillDown: { path: '/admin/users', query: { role: 'ADMINISTRATOR', isActive: 'true' } } },
  { key: 'inactiveUsers', label: 'Inactive Accounts', value: 2, drillDown: { path: '/admin/users', query: { isActive: 'false' } } },
];

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function stub(responses: Array<Response | (() => Promise<Response>)>, user: typeof staffUser = staffUser) {
  let call = 0;
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/auth/me')) return jsonResponse({ user });
    if (url.includes('/api/dashboard/staff')) {
      const r = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return typeof r === 'function' ? r() : r;
    }
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthProvider>
        <Routes>
          <Route path="/dashboard" element={<StaffDashboard now={() => NOW} />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const cardNames = (listName: string) =>
  within(screen.getByRole('list', { name: listName })).getAllByRole('link').map((l) => l.getAttribute('aria-label'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UI-L4-08: Staff Dashboard feedback states (AC-23)', () => {
  it('shows skeleton cards with aria-busy while loading', async () => {
    stub([() => new Promise<Response>(() => {})]);
    renderDashboard();
    const busy = await screen.findByTestId('dashboard-loading');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(within(busy).getByText('Loading…')).toBeInTheDocument();
  });

  it('a 500 shows the safe error and Retry; no raw error text; Retry recovers', async () => {
    stub([
      jsonResponse({ error: 'INTERNAL_ERROR', message: 'boom', stack: 'PrismaClientKnownRequestError at app.ts:610' }, 500),
      jsonResponse(makeDashboard()),
    ]);
    renderDashboard();
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/Prisma|app\.ts|INTERNAL_ERROR|boom/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'New: 4. View tickets' })).toBeInTheDocument();
  });

  it('a 403 shows the forbidden state with a link to the Dashboard and no Retry', async () => {
    stub([jsonResponse({ error: 'FORBIDDEN_ROLE' }, 403)]);
    renderDashboard();
    expect(await screen.findByText("You don't have access to this page.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('Refresh re-fetches, is disabled while loading, and updates the time', async () => {
    let release!: (r: Response) => void;
    stub([jsonResponse(makeDashboard()), () => new Promise<Response>((resolve) => { release = resolve; })]);
    renderDashboard();
    expect(await screen.findByText(/Updated 12:10 \(UTC\+7\)/)).toBeInTheDocument();
    const refresh = screen.getByRole('button', { name: /Refresh/ });
    fireEvent.click(refresh);
    await waitFor(() => expect(refresh).toBeDisabled());
    release(jsonResponse(makeDashboard({ generatedAt: '2026-11-03T06:30:00.000Z' })));
    expect(await screen.findByText(/Updated 13:30 \(UTC\+7\)/)).toBeInTheDocument();
  });
});

describe('UI-L4-09: Staff Dashboard content (AC-20, AC-21)', () => {
  it('greets the staff member by first name', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Michael!' })).toBeInTheDocument();
  });

  it('renders the six status cards with hrefs from drillDown, zero still shown and clickable', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    await screen.findByRole('list', { name: 'Ticket status' });
    expect(cardNames('Ticket status')).toEqual([
      'New: 4. View tickets',
      'Open: 3. View tickets',
      'In Progress: 5. View tickets',
      'Waiting for Requester: 2. View tickets',
      'Reopened: 0. View tickets',
      'Resolved: 2. View tickets',
    ]);
    expect(screen.getByRole('link', { name: 'New: 4. View tickets' })).toHaveAttribute('href', '/staff/tickets?currentStatus=NEW');
    expect(within(screen.getByRole('link', { name: 'Reopened: 0. View tickets' })).getByText('Nothing here right now')).toBeInTheDocument();
  });

  it('renders the workload cards; My Open Actions points at its list on the page', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    await screen.findByRole('list', { name: 'Workload' });
    expect(screen.getByRole('link', { name: 'Unassigned: 3. View tickets' })).toHaveAttribute(
      'href',
      '/staff/tickets?ticketOwnerId=unassigned&statusGroup=active',
    );
    expect(screen.getByRole('link', { name: 'My Assigned: 4. View tickets' })).toHaveAttribute(
      'href',
      '/staff/tickets?ticketOwnerId=5&statusGroup=active',
    );
    expect(screen.getByRole('link', { name: 'Marked Resolved by Requester: 1. View tickets' })).toHaveAttribute(
      'href',
      '/staff/tickets?statusGroup=active&requesterResolvedIndicator=true',
    );
    expect(screen.getByRole('link', { name: 'My Open Actions: 2. View the list below' })).toHaveAttribute('href', '#my-open-actions');
  });

  it('renders the IT Priority cards with the priority badge text, not color alone', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    await screen.findByRole('list', { name: 'IT Priority (active tickets)' });
    const high = screen.getByRole('link', { name: 'High: 5. View tickets' });
    expect(high).toHaveAttribute('href', '/staff/tickets?itPriority=HIGH&statusGroup=active');
    expect(within(high).getByText('High')).toBeInTheDocument();
  });

  it('My Open Actions rows link to the Ticket\'s #actions-taken with status and follow-up shown as text', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const region = await screen.findByRole('region', { name: 'My Open Actions' });
    const rows = within(region).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link', { name: /TKT-2026-000012/ })).toHaveAttribute('href', '/staff/tickets/12#actions-taken');
    expect(within(rows[0]).getByText('Collect VPN client logs')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Planned')).toBeInTheDocument();
    expect(within(rows[1]).getByText('In Progress')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Follow-up required')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('Follow-up required')).not.toBeInTheDocument();
  });

  it('Urgent rows show the owner or an Unassigned pill, and the Ticket\'s age', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const region = await screen.findByRole('region', { name: 'Urgent Tickets' });
    const rows = within(region).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'TKT-2026-000021' })).toHaveAttribute('href', '/staff/tickets/21');
    expect(within(rows[0]).getByText('Michael Brown')).toBeInTheDocument();
    expect(within(rows[0]).getByText('opened 3 days ago')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Unassigned')).toBeInTheDocument();
    expect(within(rows[1]).getByText('opened today')).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'View all Urgent Tickets' })).toHaveAttribute(
      'href',
      '/staff/tickets?itPriority=HIGH&statusGroup=active&sortBy=createdAt&sortOrder=asc',
    );
  });

  it('Recently Updated shows the "Requester says resolved" pill for flagged Tickets (FR-12)', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const region = await screen.findByRole('region', { name: 'Recently Updated' });
    expect(within(region).getByText(/Requester says resolved/)).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'View all Recently Updated' })).toHaveAttribute(
      'href',
      '/staff/tickets?sortBy=updatedAt&sortOrder=desc',
    );
  });

  it('shows one-line empty messages for empty lists', async () => {
    stub([
      jsonResponse(
        makeDashboard({
          lists: {
            myOpenActions: { items: [] },
            urgent: { items: [], viewAll: q({}) },
            recentlyUpdated: { items: [], viewAll: q({}) },
          },
        }),
      ),
    ]);
    renderDashboard();
    expect(await screen.findByText('You have no planned or in-progress actions.')).toBeInTheDocument();
    expect(screen.getByText('No high-priority tickets are open.')).toBeInTheDocument();
    expect(screen.getByText('No recent updates.')).toBeInTheDocument();
  });

  it('IT Staff see no User Accounts row', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    await screen.findByRole('list', { name: 'Ticket status' });
    expect(screen.queryByRole('heading', { name: 'User Accounts' })).not.toBeInTheDocument();
  });

  it('Administrators see the User Accounts row linking to filtered User Management', async () => {
    stub([jsonResponse(makeDashboard({ userAccounts }))], adminUser);
    renderDashboard();
    expect(await screen.findByRole('heading', { level: 2, name: 'User Accounts' })).toBeInTheDocument();
    expect(cardNames('User Accounts')).toEqual([
      'Active Requesters: 5. View users',
      'Active IT Staff: 4. View users',
      'Active Administrators: 1. View users',
      'Inactive Accounts: 2. View users',
    ]);
    expect(screen.getByRole('link', { name: 'Inactive Accounts: 2. View users' })).toHaveAttribute('href', '/admin/users?isActive=false');
  });

  it('offers the Quick Actions', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const quick = await screen.findByRole('region', { name: 'Quick Actions' });
    expect(within(quick).getByRole('link', { name: /Ticket Queue/ })).toHaveAttribute('href', '/staff/tickets');
    expect(within(quick).getByRole('link', { name: /Unassigned tickets/ })).toHaveAttribute(
      'href',
      '/staff/tickets?ticketOwnerId=unassigned&statusGroup=active',
    );
  });
});
