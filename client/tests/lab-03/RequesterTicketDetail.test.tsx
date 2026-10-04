import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { RequesterTicketDetail } from '../../src/screens/RequesterTicketDetail';

const mockAuthUser = {
  id: 1,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@example.com',
  role: 'REQUESTER',
  mustChangePassword: false,
};

function makeTicketDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    ticketNumber: 'TKT-2026-000101',
    requesterId: 1,
    categoryId: 2,
    categoryName: 'Hardware',
    relatedSystemId: 5,
    relatedSystemName: 'Corporate Laptop',
    summary: 'Laptop battery drains quickly',
    description: 'The battery drains from 100% to 10% within an hour of unplugging.',
    requestedPriority: 'MEDIUM',
    itPriority: null,
    currentStatus: 'NEW',
    ticketOwnerId: null,
    ticketOwnerName: null,
    requesterResolvedIndicator: false,
    publicCommentsCount: 0,
    createdAt: '2026-08-20T09:14:00.000Z',
    updatedAt: '2026-08-20T09:14:00.000Z',
    attachments: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function stubFetch(handlers: {
  ticket?: () => Response;
  comments?: () => Response;
  extra?: (url: string, init?: RequestInit) => Response | undefined;
}) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(jsonResponse({ user: mockAuthUser }));
    }
    if (url.includes('/notes')) {
      throw new Error('Internal Notes must never be requested from the Requester Ticket Detail screen (AC-04)');
    }
    const extra = handlers.extra?.(url, init);
    if (extra) return Promise.resolve(extra);
    if (url.includes('/comments') && (!init || init.method === undefined)) {
      return Promise.resolve(handlers.comments ? handlers.comments() : jsonResponse([]));
    }
    if (url.match(/\/api\/tickets\/\d+$/)) {
      return Promise.resolve(handlers.ticket ? handlers.ticket() : jsonResponse(makeTicketDetail()));
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderTicketDetail() {
  return render(
    <MemoryRouter initialEntries={['/tickets/101']}>
      <AuthProvider>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          <Route path="/tickets" element={<div>My Tickets Screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-11: Requester Ticket Detail Screen (regression, FR-11)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('AC-20: renders all ticket fields as read-only with correct values', async () => {
    stubFetch({ ticket: () => jsonResponse(makeTicketDetail()) });

    renderTicketDetail();

    expect(await screen.findByText('TKT-2026-000101')).toBeInTheDocument();

    expect(screen.getByLabelText('Category')).toHaveValue('Hardware');
    expect(screen.getByLabelText('Category')).toBeDisabled();
    expect(screen.getByLabelText('Related System')).toHaveValue('Corporate Laptop');
    expect(screen.getByLabelText('Requester')).toHaveValue('Jennifer Anderson');
    expect(screen.getByLabelText('Ticket Owner')).toHaveValue('Unassigned');

    expect(screen.getByText('Laptop battery drains quickly')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Not yet triaged')).toBeInTheDocument();
  });

  it('shows the real Ticket Owner and IT Priority once the ticket has been triaged and claimed', async () => {
    stubFetch({
      ticket: () =>
        jsonResponse(
          makeTicketDetail({
            itPriority: 'HIGH',
            ticketOwnerId: 5,
            ticketOwnerName: 'Michael Brown',
            currentStatus: 'IN_PROGRESS',
          }),
        ),
    });

    renderTicketDetail();

    expect(await screen.findByLabelText('Ticket Owner')).toHaveValue('Michael Brown');
    expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it("AC-03: a nonexistent/not-owned ticket shows a safe not-found state instead of leaking data", async () => {
    stubFetch({ ticket: () => jsonResponse({ error: 'TICKET_NOT_FOUND' }, 404) });

    renderTicketDetail();

    expect(
      await screen.findByText(/This ticket could not be found, or you do not have access to it\./i),
    ).toBeInTheDocument();
  });

  describe('Public Comments (BR-04, BR-14, BR-15)', () => {
    it('loads and renders the existing comment thread', async () => {
      stubFetch({
        ticket: () => jsonResponse(makeTicketDetail({ currentStatus: 'IN_PROGRESS' })),
        comments: () =>
          jsonResponse([
            {
              id: 1,
              content: 'Any update on this?',
              createdAt: '2026-08-20T10:00:00.000Z',
              author: { id: 1, name: 'Jennifer Anderson', role: 'REQUESTER' },
            },
            {
              id: 2,
              content: 'Looking into it now.',
              createdAt: '2026-08-20T10:05:00.000Z',
              author: { id: 5, name: 'Michael Brown', role: 'IT_STAFF' },
            },
          ]),
      });

      renderTicketDetail();

      expect(await screen.findByText('Any update on this?')).toBeInTheDocument();
      expect(screen.getByText('Looking into it now.')).toBeInTheDocument();
      expect(screen.getByText('Michael Brown')).toBeInTheDocument();
    });

    it('posts a new comment and appends it to the thread', async () => {
      const fetchMock = stubFetch({
        ticket: () => jsonResponse(makeTicketDetail({ currentStatus: 'IN_PROGRESS' })),
        comments: () => jsonResponse([]),
        extra: (url, init) => {
          if (url.includes('/comments') && init?.method === 'POST') {
            return jsonResponse({
              id: 99,
              content: JSON.parse(init.body as string).content,
              createdAt: '2026-08-20T11:00:00.000Z',
              author: { id: 1, name: 'Jennifer Anderson', role: 'REQUESTER' },
            });
          }
          return undefined;
        },
      });

      renderTicketDetail();

      await waitFor(() => expect(screen.getByLabelText(/Add Comment/i)).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText(/Add Comment/i), { target: { value: 'Still happening today.' } });
      fireEvent.click(screen.getByRole('button', { name: /Post Comment/i }));

      expect(await screen.findByText('Still happening today.')).toBeInTheDocument();

      const postCall = fetchMock.mock.calls.find(
        (call) => (call[0] as string).includes('/comments') && call[1]?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect((postCall![1]!.headers as Record<string, string>)['X-Requested-With']).toBe('XMLHttpRequest');
    });
  });

  describe('Problem Appears Resolved (FR-13, BR-06)', () => {
    it('is visible while IN_PROGRESS and, once confirmed, shows a persistent confirmation instead of the button', async () => {
      stubFetch({
        ticket: () => jsonResponse(makeTicketDetail({ currentStatus: 'IN_PROGRESS' })),
        extra: (url) => {
          if (url.includes('/resolve-indicator')) {
            return jsonResponse({ id: 101, requesterResolvedIndicator: true, message: 'ok' });
          }
          return undefined;
        },
      });

      renderTicketDetail();

      const button = await screen.findByRole('button', { name: /Problem Appears Resolved/i });
      fireEvent.click(button);

      expect(await screen.findByTestId('resolved-indicator-confirmation')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Problem Appears Resolved/i })).not.toBeInTheDocument();
    });

    it('is not shown for a NEW ticket', async () => {
      stubFetch({ ticket: () => jsonResponse(makeTicketDetail({ currentStatus: 'NEW' })) });

      renderTicketDetail();
      await screen.findByText('TKT-2026-000101');

      expect(screen.queryByRole('button', { name: /Problem Appears Resolved/i })).not.toBeInTheDocument();
    });
  });

  describe('Cancel Ticket (FR-13.1, BR-13)', () => {
    it('is visible only while NEW, and confirming calls the cancel endpoint', async () => {
      const fetchMock = stubFetch({
        ticket: () => jsonResponse(makeTicketDetail({ currentStatus: 'NEW' })),
        extra: (url) => {
          if (url.includes('/cancel')) {
            return jsonResponse({ id: 101, currentStatus: 'CANCELLED', updatedAt: '2026-08-20T12:00:00.000Z' });
          }
          return undefined;
        },
      });

      renderTicketDetail();

      const cancelButton = await screen.findByRole('button', { name: /Cancel Ticket/i });
      fireEvent.click(cancelButton);

      const reasonInput = await screen.findByLabelText(/Reason for cancellation/i);
      fireEvent.change(reasonInput, { target: { value: 'No longer needed.' } });
      fireEvent.click(screen.getByRole('button', { name: /Confirm Cancellation/i }));

      await waitFor(() => {
        const cancelCall = fetchMock.mock.calls.find((call) => (call[0] as string).includes('/cancel'));
        expect(cancelCall).toBeDefined();
      });
      expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    });

    it('is not shown once the ticket is IN_PROGRESS', async () => {
      stubFetch({ ticket: () => jsonResponse(makeTicketDetail({ currentStatus: 'IN_PROGRESS' })) });

      renderTicketDetail();
      await screen.findByText('TKT-2026-000101');

      expect(screen.queryByRole('button', { name: /Cancel Ticket/i })).not.toBeInTheDocument();
    });
  });

  it('AC-04: never requests or renders Internal Notes on the Requester screen', async () => {
    stubFetch({
      ticket: () => jsonResponse(makeTicketDetail({ currentStatus: 'IN_PROGRESS' })),
      comments: () => jsonResponse([]),
    });

    renderTicketDetail();

    await screen.findByText('TKT-2026-000101');
    expect(screen.queryByText(/Internal Note/i)).not.toBeInTheDocument();
  });
});
