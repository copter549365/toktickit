import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { StaffTicketQueue } from '../../src/screens/StaffTicketQueue';

const mockCategories = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
];

const mockAuthUser = {
  id: 5,
  name: 'Michael Brown',
  email: 'michael.brown@example.com',
  role: 'IT_STAFF',
  mustChangePassword: false,
};

function makeTicket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    ticketNumber: 'TKT-2026-000001',
    createdAt: '2026-08-20T09:14:00.000Z',
    summary: 'Laptop battery drains quickly',
    category: { id: 2, name: 'Hardware' },
    requestedPriority: 'MEDIUM',
    itPriority: 'MEDIUM',
    currentStatus: 'IN_PROGRESS',
    requester: { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com' },
    owner: { id: 5, name: 'Michael Brown' },
    requesterResolvedIndicator: false,
    updatedAt: '2026-08-20T09:14:00.000Z',
    ...overrides,
  };
}

function emptyResponse() {
  return { data: [], meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 1 } };
}

async function findInTable(text: string) {
  const table = await screen.findByTestId('staff-queue-table');
  return within(table).findByText(text);
}

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets']}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets" element={<StaffTicketQueue />} />
          <Route path="/staff/tickets/:id" element={<div>Staff Ticket Detail Screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-04: Staff Ticket Queue (AC-05, FR-15)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubFetch(queueHandler: (url: string) => Promise<Response>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/me')) {
          return Promise.resolve({ ok: true, json: async () => ({ user: mockAuthUser }) } as Response);
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({ ok: true, json: async () => mockCategories } as Response);
        }
        if (url.includes('/api/staff/tickets')) {
          return queueHandler(url);
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }),
    );
  }

  it('renders the queue table with priority, IT priority, and status badges', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ data: [makeTicket()], meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 } }),
      } as Response),
    );

    renderQueue();

    expect(await findInTable('TKT-2026-000001')).toBeInTheDocument();
    const table = await screen.findByTestId('staff-queue-table');
    expect(within(table).getAllByText('Medium')).toHaveLength(2); // Req. Priority + IT Priority
    expect(await findInTable('In Progress')).toBeInTheDocument();
    expect(await findInTable('Hardware')).toBeInTheDocument();
    expect(await findInTable('Michael Brown')).toBeInTheDocument();
  });

  it('renders Empty state distinct from No-results state', async () => {
    stubFetch(() => Promise.resolve({ ok: true, json: async () => emptyResponse() } as Response));

    renderQueue();

    expect(await screen.findByText('No tickets in queue.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '1' } });

    expect(await screen.findByText(/No tickets match your filters/i)).toBeInTheDocument();
    expect(screen.queryByText('No tickets in queue.')).not.toBeInTheDocument();
  });

  it('a status filter change re-queries with the selected status', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ data: [makeTicket()], meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 } }),
      } as Response),
    );

    renderQueue();
    await findInTable('TKT-2026-000001');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'RESOLVED' } });

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: any[]) =>
        (call[0] as string).includes('/api/staff/tickets'),
      );
      expect(calls.some((call: any[]) => (call[0] as string).includes('currentStatus=RESOLVED'))).toBe(true);
    });
  });

  it('the "Assigned to Me" owner filter resolves to the authenticated user\'s own id', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ data: [makeTicket()], meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 } }),
      } as Response),
    );

    renderQueue();
    await findInTable('TKT-2026-000001');

    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'me' } });

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: any[]) =>
        (call[0] as string).includes('/api/staff/tickets'),
      );
      expect(calls.some((call: any[]) => (call[0] as string).includes(`ticketOwnerId=${mockAuthUser.id}`))).toBe(
        true,
      );
    });
  });

  it('clicking a sortable column header toggles sortBy/sortOrder query params', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ data: [makeTicket()], meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 } }),
      } as Response),
    );

    renderQueue();
    await findInTable('TKT-2026-000001');

    fireEvent.click(screen.getByRole('button', { name: /Sort by Ticket No\./i }));

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: any[]) =>
        (call[0] as string).includes('/api/staff/tickets'),
      );
      expect(
        calls.some(
          (call: any[]) =>
            (call[0] as string).includes('sortBy=ticketNumber') && (call[0] as string).includes('sortOrder=asc'),
        ),
      ).toBe(true);
    });
  });

  it('opening a ticket navigates to the Staff Ticket Detail route', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ data: [makeTicket()], meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 } }),
      } as Response),
    );

    renderQueue();
    await findInTable('TKT-2026-000001');

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(await screen.findByText('Staff Ticket Detail Screen')).toBeInTheDocument();
  });

  it('shows a safe error with Retry when the queue API fails', async () => {
    let callCount = 0;
    stubFetch(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [makeTicket()], meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 } }),
      } as Response);
    });

    renderQueue();

    expect(await screen.findByText(/Unable to reach the server/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    expect(await findInTable('TKT-2026-000001')).toBeInTheDocument();
  });
});
