/**
 * client/tests/lab-04/RequesterDashboard.test.tsx
 *
 * Tests: UI-L4-01 and UI-L4-02 (docs/lab-04/tests.md §2.6), plus the AC-23 feedback states on the
 * Requester Dashboard: cards and lists rendered from the API, drill-down hrefs built from
 * `drillDown`, Bangkok times, the empty state, loading, safe failure with Retry, and forbidden.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { RequesterDashboard } from '../../src/screens/RequesterDashboard';

const requesterUser = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com', role: 'REQUESTER', mustChangePassword: false };

function item(id: number, currentStatus: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ticketNumber: `TKT-2026-${String(id).padStart(6, '0')}`,
    summary: `Ticket summary ${id}`,
    currentStatus,
    itPriority: 'MEDIUM',
    owner: { id: 5, name: 'Michael Brown' },
    updatedAt: '2026-11-03T05:10:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

function makeDashboard(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-11-03T05:10:00.000Z',
    displayTimeZone: 'Asia/Bangkok',
    recentWindowDays: 7,
    cards: [
      { key: 'openTickets', label: 'My Open Tickets', value: 3, drillDown: { path: '/tickets', query: { statusGroup: 'active' } } },
      { key: 'waitingForMe', label: 'Waiting for Me', value: 1, drillDown: { path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } } },
      { key: 'resolved', label: 'Resolved', value: 2, drillDown: { path: '/tickets', query: { currentStatus: 'RESOLVED' } } },
      { key: 'closed', label: 'Closed', value: 0, drillDown: { path: '/tickets', query: { currentStatus: 'CLOSED' } } },
    ],
    lists: {
      attentionRequired: {
        items: [item(11, 'WAITING_FOR_REQUESTER'), item(12, 'RESOLVED', { resolvedAt: '2026-11-02T03:00:00.000Z' })],
        viewAll: { path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } },
      },
      recentlyUpdated: {
        items: [item(13, 'IN_PROGRESS', { summary: 'A very long summary that should be truncated on one line with the full text in the title' })],
        viewAll: { path: '/tickets', query: { sortBy: 'updatedAt', sortOrder: 'desc' } },
      },
      recentlyResolved: {
        items: [item(12, 'RESOLVED', { resolvedAt: '2026-11-02T03:00:00.000Z' })],
        viewAll: { path: '/tickets', query: { currentStatus: 'RESOLVED' } },
      },
    },
    ...overrides,
  };
}

const emptyDashboard = makeDashboard({
  cards: makeDashboard().cards.map((c) => ({ ...c, value: 0 })),
  lists: {
    attentionRequired: { items: [], viewAll: { path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } } },
    recentlyUpdated: { items: [], viewAll: { path: '/tickets', query: { sortBy: 'updatedAt', sortOrder: 'desc' } } },
    recentlyResolved: { items: [], viewAll: { path: '/tickets', query: { currentStatus: 'RESOLVED' } } },
  },
});

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** `responses` are returned in order for successive dashboard calls; the last one repeats. */
function stub(responses: Array<Response | (() => Promise<Response>)>) {
  let call = 0;
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/auth/me')) return jsonResponse({ user: requesterUser });
    if (url.includes('/api/dashboard/requester')) {
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
          <Route path="/dashboard" element={<RequesterDashboard />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UI-L4-01: Requester Dashboard renders API data (FR-13, AC-19)', () => {
  it('greets the Requester by first name', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Jennifer!' })).toBeInTheDocument();
  });

  it('renders 4 cards as one link each, with the value in the accessible name and an href from drillDown', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const grid = await screen.findByRole('list', { name: 'Ticket summary' });
    const cards = within(grid).getAllByRole('link');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'My Open Tickets: 3. View tickets',
      'Waiting for Me: 1. View tickets',
      'Resolved: 2. View tickets',
      'Closed: 0. View tickets',
    ]);
    expect(cards.map((c) => c.getAttribute('href'))).toEqual([
      '/tickets?statusGroup=active',
      '/tickets?currentStatus=WAITING_FOR_REQUESTER',
      '/tickets?currentStatus=RESOLVED',
      '/tickets?currentStatus=CLOSED',
    ]);
  });

  it('shows a zero value as "0" with the muted helper text, and keeps the card clickable (BR-25)', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const closed = await screen.findByRole('link', { name: 'Closed: 0. View tickets' });
    expect(within(closed).getByText('0')).toBeInTheDocument();
    expect(within(closed).getByText('Nothing here right now')).toBeInTheDocument();
  });

  it('renders the three lists under h2 headings with rows linking to the Ticket', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    for (const name of ['Needs My Attention', 'Recently Updated', 'Recently Resolved']) {
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    const attention = screen.getByRole('region', { name: 'Needs My Attention' });
    const rows = within(attention).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link', { name: 'TKT-2026-000011' })).toHaveAttribute('href', '/tickets/11');
    expect(within(rows[0]).getByText('Waiting for Requester')).toBeInTheDocument();
  });

  it('shows the hint for each attention reason', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const attention = await screen.findByRole('region', { name: 'Needs My Attention' });
    expect(within(attention).getByText('Staff are waiting for your reply')).toBeInTheDocument();
    expect(within(attention).getByText('Please confirm the fix')).toBeInTheDocument();
  });

  it('builds each "View all" link from viewAll', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const updated = await screen.findByRole('region', { name: 'Recently Updated' });
    expect(within(updated).getByRole('link', { name: 'View all Recently Updated' })).toHaveAttribute(
      'href',
      '/tickets?sortBy=updatedAt&sortOrder=desc',
    );
    const attention = screen.getByRole('region', { name: 'Needs My Attention' });
    expect(within(attention).getByRole('link', { name: 'View all Needs My Attention' })).toHaveAttribute(
      'href',
      '/tickets?currentStatus=WAITING_FOR_REQUESTER',
    );
  });

  it('shows dates in Asia/Bangkok and keeps the full summary in title', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const updated = await screen.findByRole('region', { name: 'Recently Updated' });
    // 05:10 UTC is 12:10 in Bangkok.
    expect(within(updated).getByText(/3 Nov 2026, 12:10/)).toBeInTheDocument();
    const summary = within(updated).getByText(/A very long summary/);
    expect(summary).toHaveAttribute('title', 'A very long summary that should be truncated on one line with the full text in the title');
    expect(screen.getByText(/Updated 12:10 \(UTC\+7\)/)).toBeInTheDocument();
  });

  it('offers the Quick Actions', async () => {
    stub([jsonResponse(makeDashboard())]);
    renderDashboard();
    const quick = await screen.findByRole('region', { name: 'Quick Actions' });
    expect(within(quick).getByRole('link', { name: /Create Ticket/ })).toHaveAttribute('href', '/tickets/new');
    expect(within(quick).getByRole('link', { name: /View My Tickets/ })).toHaveAttribute('href', '/tickets');
  });

  it('Refresh re-fetches and is disabled while loading', async () => {
    let release!: (r: Response) => void;
    const fetchMock = stub([
      jsonResponse(makeDashboard()),
      () => new Promise<Response>((resolve) => { release = resolve; }),
    ]);
    renderDashboard();
    const refresh = await screen.findByRole('button', { name: /Refresh/ });
    fireEvent.click(refresh);
    await waitFor(() => expect(refresh).toBeDisabled());
    release(jsonResponse(makeDashboard({ generatedAt: '2026-11-03T06:00:00.000Z' })));
    expect(await screen.findByText(/Updated 13:00 \(UTC\+7\)/)).toBeInTheDocument();
    expect(refresh).not.toBeDisabled();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/dashboard/requester'))).toHaveLength(2);
  });
});

describe('UI-L4-02: Requester empty state (BR-25, AC-19)', () => {
  it('shows all zeros as "0" and the "Create your first ticket" call to action', async () => {
    stub([jsonResponse(emptyDashboard)]);
    renderDashboard();
    const grid = await screen.findByRole('list', { name: 'Ticket summary' });
    expect(within(grid).getAllByRole('link').map((c) => c.getAttribute('aria-label'))).toEqual([
      'My Open Tickets: 0. View tickets',
      'Waiting for Me: 0. View tickets',
      'Resolved: 0. View tickets',
      'Closed: 0. View tickets',
    ]);
    expect(screen.getByText("You haven't created any tickets yet")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first ticket' })).toHaveAttribute('href', '/tickets/new');
    expect(screen.queryByRole('heading', { name: 'Needs My Attention' })).not.toBeInTheDocument();
  });

  it('shows one-line empty messages when only some lists are empty', async () => {
    stub([
      jsonResponse(
        makeDashboard({
          lists: {
            ...makeDashboard().lists,
            attentionRequired: { items: [], viewAll: { path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } } },
            recentlyResolved: { items: [], viewAll: { path: '/tickets', query: { currentStatus: 'RESOLVED' } } },
          },
        }),
      ),
    ]);
    renderDashboard();
    expect(await screen.findByText('No tickets need your attention.')).toBeInTheDocument();
    expect(screen.getByText('No tickets were resolved in the last 7 days.')).toBeInTheDocument();
  });
});

describe('AC-23: Requester Dashboard feedback states', () => {
  it('shows skeleton cards with aria-busy while loading', async () => {
    stub([() => new Promise<Response>(() => {})]);
    renderDashboard();
    const busy = await screen.findByTestId('dashboard-loading');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(within(busy).getByText('Loading…')).toBeInTheDocument();
  });

  it('a 500 shows the safe error with Retry, and Retry recovers', async () => {
    stub([
      jsonResponse({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', stack: 'Error: at db.ts:12' }, 500),
      jsonResponse(makeDashboard()),
    ]);
    renderDashboard();
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/db\.ts|INTERNAL_ERROR/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'My Open Tickets: 3. View tickets' })).toBeInTheDocument();
  });

  it('a network failure shows the same safe error', async () => {
    stub([() => Promise.reject(new TypeError('Failed to fetch'))]);
    renderDashboard();
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it('a 403 shows the forbidden state with a link to the Dashboard', async () => {
    stub([jsonResponse({ error: 'FORBIDDEN_ROLE', message: 'You do not have permission to perform this action.' }, 403)]);
    renderDashboard();
    expect(await screen.findByText("You don't have access to this page.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
