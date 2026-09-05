import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequesterProvider, useRequester } from '../../src/context/RequesterContext';
import { MyTickets } from '../../src/screens/MyTickets';

const mockCategories = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
];

const requesterA = {
  id: 1,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@example.com',
  isActive: true,
};

const requesterB = {
  id: 2,
  name: 'Michael Chen',
  email: 'michael.chen@example.com',
  isActive: true,
};

function makeTicket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    categoryId: 1,
    categoryName: 'Hardware',
    requestedPriority: 'MEDIUM',
    itPriority: null,
    currentStatus: 'NEW',
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
async function findInTable(text: string) {
  const table = await screen.findByTestId('my-tickets-table');
  return within(table).findByText(text);
}

function renderMyTickets() {
  return render(
    <MemoryRouter initialEntries={['/tickets']}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<div>Create Ticket Screen</div>} />
          <Route path="/tickets/:id" element={<div>Ticket Detail Screen</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  );
}

describe('UI-07..UI-10: My Tickets Screen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  function stubFetch(
    ticketsHandler: (url: string, init?: RequestInit) => Promise<Response>,
  ) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
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
    sessionStorage.setItem('toktickit.actingRequester', JSON.stringify(requesterA));
    stubFetch(() => Promise.resolve({ ok: true, json: async () => emptyResponse() } as Response));

    renderMyTickets();

    expect(await screen.findByText(/haven't created any tickets yet/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '1' } });

    expect(await screen.findByText(/No tickets match your filters/i)).toBeInTheDocument();
    // Empty-state copy must not still be shown once a filter narrows the (still zero) results.
    expect(screen.queryByText(/haven't created any tickets yet/i)).not.toBeInTheDocument();
  });

  it('UI-08: re-fetches under the new identity when the acting Requester changes, clearing old rows first', async () => {
    sessionStorage.setItem('toktickit.actingRequester', JSON.stringify(requesterA));

    let resolveB: (value: Response) => void = () => {};
    const pendingB = new Promise<Response>((resolve) => {
      resolveB = resolve;
    });

    stubFetch((_url, init) => {
      const headers = init?.headers as Record<string, string>;
      if (headers?.['x-requester-id'] === String(requesterB.id)) {
        return pendingB;
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [makeTicket({ summary: 'Requester A ticket' })],
          meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
        }),
      } as Response);
    });

    function SwitchToBButton() {
      const { selectRequester } = useRequester();
      return <button onClick={() => selectRequester(requesterB)}>Switch to B</button>;
    }

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <RequesterProvider>
          <SwitchToBButton />
          <MyTickets />
        </RequesterProvider>
      </MemoryRouter>,
    );

    expect(await findInTable('Requester A ticket')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to B' }));

    // Old rows are cleared (loading state shown) before Requester B's data arrives (BR-06, AC-12).
    await waitFor(() => {
      expect(screen.queryByText('Requester A ticket')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Loading your tickets/i)).toBeInTheDocument();

    resolveB({
      ok: true,
      json: async () => ({
        data: [makeTicket({ id: 2, ticketNumber: 'TKT-2026-000002', summary: 'Requester B ticket' })],
        meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
      }),
    } as Response);

    expect(await findInTable('Requester B ticket')).toBeInTheDocument();

    const ticketCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: any[]) =>
      (call[0] as string).includes('/api/tickets'),
    );
    const lastCall = ticketCalls[ticketCalls.length - 1];
    const lastHeaders = lastCall[1]?.headers as Record<string, string>;
    expect(lastHeaders['x-requester-id']).toBe(String(requesterB.id));
  });

  it('UI-09: pagination and sort controls update query params and re-render', async () => {
    sessionStorage.setItem('toktickit.actingRequester', JSON.stringify(requesterA));

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
          (call: any[]) => (call[0] as string).includes('sortBy=ticketNumber') && (call[0] as string).includes('sortOrder=asc'),
        ),
      ).toBe(true);
    });
  });

  it('UI-10: API-failure state shows a Retry action instead of a blank or crashed screen', async () => {
    sessionStorage.setItem('toktickit.actingRequester', JSON.stringify(requesterA));

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

  it('UI-11: ignores stale responses when rapid page transitions occur', async () => {
    sessionStorage.setItem('toktickit.actingRequester', JSON.stringify(requesterA));

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

    // User clicks page 2
    fireEvent.click(screen.getByRole('button', { name: '2' }));

    // User quickly clicks page 3 before page 2 resolves
    fireEvent.click(screen.getByRole('button', { name: '3' }));

    // Page 3 resolves first
    expect(await findInTable('Page three ticket')).toBeInTheDocument();

    // Now page 2 resolves late
    resolvePage2({
      ok: true,
      json: async () => ({
        data: [makeTicket({ id: 2, ticketNumber: 'TKT-2026-000002', summary: 'Page two stale ticket' })],
        meta: { page: 2, pageSize: 10, totalCount: 25, totalPages: 3 },
      }),
    } as Response);

    // Stale page 2 response must NOT overwrite page 3 data
    await new Promise((r) => setTimeout(r, 50));
    expect(await findInTable('Page three ticket')).toBeInTheDocument();
    expect(screen.queryByText('Page two stale ticket')).not.toBeInTheDocument();
  });
});

