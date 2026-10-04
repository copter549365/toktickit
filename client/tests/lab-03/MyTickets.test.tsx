import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { MyTickets } from '../../src/screens/MyTickets';

const mockCategories = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
];

const mockAuthUser = {
  id: 1,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@example.com',
  role: 'REQUESTER',
  mustChangePassword: false,
};

function makeTicket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    category: { id: 2, name: 'Hardware' },
    relatedSystem: { id: 1, name: 'Corporate Laptop' },
    requestedPriority: 'MEDIUM',
    itPriority: 'MEDIUM',
    currentStatus: 'NEW',
    requesterResolvedIndicator: false,
    owner: null,
    createdAt: '2026-08-20T09:14:00.000Z',
    updatedAt: '2026-08-20T09:14:00.000Z',
    ...overrides,
  };
}

function emptyResponse() {
  return { data: [], meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 1 } };
}

// The desktop table and mobile card layout both render in jsdom (no real media queries), so scope
// row-content assertions to the table to avoid ambiguous duplicate-text matches.
/** Re-queries the table on every retry so a remounted table is never searched as a stale node. */
async function findInTable(text: string) {
  return waitFor(() => within(screen.getByTestId('my-tickets-table')).getByText(text));
}

function renderMyTickets() {
  return render(
    <MemoryRouter initialEntries={['/tickets']}>
      <AuthProvider>
        <Routes>
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<div>Create Ticket Screen</div>} />
          <Route path="/tickets/:id" element={<div>Ticket Detail Screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-07, UI-09..UI-11: My Tickets Screen (regression under real auth, FR-11)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubFetch(ticketsHandler: (url: string, init?: RequestInit) => Promise<Response>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) {
          return Promise.resolve({ ok: true, json: async () => ({ user: mockAuthUser }) } as Response);
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, json: async () => mockCategories } as Response);
        }
        if (url.includes('/api/tickets')) {
          return ticketsHandler(url, init);
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }),
    );
  }

  it('UI-07: renders Empty state vs No-results state distinctly', async () => {
    stubFetch(() => Promise.resolve({ ok: true, json: async () => emptyResponse() } as Response));

    renderMyTickets();

    expect(await screen.findByText(/haven't created any tickets yet/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '1' } });

    expect(await screen.findByText(/No tickets match your filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/haven't created any tickets yet/i)).not.toBeInTheDocument();
  });

  it('scopes the greeting and requests to the authenticated user, with no dev-selector in sight', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ data: [makeTicket()], meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 } }),
      } as Response),
    );

    renderMyTickets();

    expect(await screen.findByText(/scoped to Jennifer Anderson/i)).toBeInTheDocument();
    expect(screen.queryByText(/Change Requester/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Select Development Requester/i)).not.toBeInTheDocument();
  });

  it('renders the nested category from the response and every status badge without crashing', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            makeTicket({ id: 1, ticketNumber: 'TKT-2026-000001', currentStatus: 'IN_PROGRESS' }),
            makeTicket({ id: 2, ticketNumber: 'TKT-2026-000002', currentStatus: 'WAITING_FOR_REQUESTER' }),
          ],
          meta: { page: 1, pageSize: 10, totalCount: 2, totalPages: 1 },
        }),
      } as Response),
    );

    renderMyTickets();

    const table = await screen.findByTestId('my-tickets-table');
    expect(await within(table).findAllByText('Hardware')).toHaveLength(2);
    expect(await findInTable('In Progress')).toBeInTheDocument();
    expect(await findInTable('Waiting for Requester')).toBeInTheDocument();
  });

  it('UI-09: pagination and sort controls update query params and re-render', async () => {
    stubFetch((url) => {
      const params = new URL(url).searchParams;
      if (params.get('page') === '2') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [makeTicket({ id: 2, ticketNumber: 'TKT-2026-000002', summary: 'Page two ticket' })],
            meta: { page: 2, pageSize: 10, totalCount: 11, totalPages: 2 },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [makeTicket({ id: 1, ticketNumber: 'TKT-2026-000001', summary: 'Page one ticket' })],
          meta: { page: 1, pageSize: 10, totalCount: 11, totalPages: 2 },
        }),
      } as Response);
    });

    renderMyTickets();

    expect(await findInTable('Page one ticket')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await findInTable('Page two ticket')).toBeInTheDocument();

    let ticketCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: any[]) =>
      (call[0] as string).includes('/api/tickets'),
    );
    expect(ticketCalls.some((call: any[]) => (call[0] as string).includes('page=2'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Sort by Ticket No\./i }));

    await waitFor(() => {
      ticketCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: any[]) =>
        (call[0] as string).includes('/api/tickets'),
      );
      expect(
        ticketCalls.some(
          (call: any[]) =>
            (call[0] as string).includes('sortBy=ticketNumber') && (call[0] as string).includes('sortOrder=asc'),
        ),
      ).toBe(true);
    });
  });

  it('UI-10: API-failure state shows a Retry action instead of a blank or crashed screen', async () => {
    let callCount = 0;
    stubFetch(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [makeTicket()],
          meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
        }),
      } as Response);
    });

    renderMyTickets();

    expect(await screen.findByText(/Unable to reach the server/i)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /Retry/i });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);

    expect(await findInTable('TKT-2026-000001')).toBeInTheDocument();
  });

  it('UI-19: paging right after load is not reset to page 1 by the search debounce', async () => {
    stubFetch((url) => {
      const page = new URL(url).searchParams.get('page') ?? '1';
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [makeTicket({ id: Number(page), summary: `Page ${page} ticket` })],
          meta: { page: Number(page), pageSize: 10, totalCount: 25, totalPages: 3 },
        }),
      } as Response);
    });

    renderMyTickets();
    await findInTable('Page 1 ticket');
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await findInTable('Page 2 ticket');

    // Outlast the 300ms debounce window that used to fire setPage(1) on mount.
    await new Promise((r) => setTimeout(r, 450));
    expect(within(screen.getByTestId('my-tickets-table')).getByText('Page 2 ticket')).toBeInTheDocument();
    const ticketCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((call: any[]) => call[0] as string)
      .filter((url) => url.includes('/api/tickets'));
    expect(new URL(ticketCalls[ticketCalls.length - 1]).searchParams.get('page')).toBe('2');
  });

  it('UI-11: ignores stale responses when rapid page transitions occur', async () => {
    let resolvePage2: (value: Response) => void = () => {};
    const pendingPage2 = new Promise<Response>((resolve) => {
      resolvePage2 = resolve;
    });

    stubFetch((url) => {
      const params = new URL(url).searchParams;
      if (params.get('page') === '2') {
        return pendingPage2;
      }
      if (params.get('page') === '3') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [makeTicket({ id: 3, ticketNumber: 'TKT-2026-000003', summary: 'Page three ticket' })],
            meta: { page: 3, pageSize: 10, totalCount: 25, totalPages: 3 },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [makeTicket({ id: 1, ticketNumber: 'TKT-2026-000001', summary: 'Page one ticket' })],
          meta: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3 },
        }),
      } as Response);
    });

    renderMyTickets();

    expect(await findInTable('Page one ticket')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));

    expect(await findInTable('Page three ticket')).toBeInTheDocument();

    resolvePage2({
      ok: true,
      json: async () => ({
        data: [makeTicket({ id: 2, ticketNumber: 'TKT-2026-000002', summary: 'Page two stale ticket' })],
        meta: { page: 2, pageSize: 10, totalCount: 25, totalPages: 3 },
      }),
    } as Response);

    await new Promise((r) => setTimeout(r, 50));
    expect(await findInTable('Page three ticket')).toBeInTheDocument();
    expect(screen.queryByText('Page two stale ticket')).not.toBeInTheDocument();
  });
});
