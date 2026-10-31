/**
 * client/tests/lab-04/DrillDownFilters.test.tsx
 *
 * Tests: UI-L4-11, My Tickets part (docs/lab-04/tests.md §2.6; FR-16, AC-22, ui-spec §7).
 * My Tickets reads its filters from the URL, sends them to the API, shows them in the controls,
 * writes changes back to the URL, and shows a dismissible "Filtered from Dashboard" chip.
 * The Queue and User Management parts follow with the Staff Dashboard (Issue 7).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation, Link } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { MyTickets } from '../../src/screens/MyTickets';

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
