import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { StaffTicketDetail } from '../../src/screens/StaffTicketDetail';

const mockAuthUser = {
  id: 5,
  name: 'Michael Brown',
  email: 'michael.brown@example.com',
  role: 'IT_STAFF',
  mustChangePassword: false,
};

const mockStaffMembers = [
  { id: 5, name: 'Michael Brown', email: 'michael.brown@toktickit.com', role: 'IT_STAFF' },
  { id: 6, name: 'Lisa Martinez', email: 'lisa.martinez@toktickit.com', role: 'IT_STAFF' },
];

function makeTicketDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    ticketNumber: 'TKT-2026-000101',
    requester: { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com' },
    categoryId: 2,
    categoryName: 'Hardware',
    relatedSystemId: 5,
    relatedSystemName: 'Corporate Laptop',
    summary: 'Laptop battery drains quickly',
    description: 'The battery drains from 100% to 10% within an hour of unplugging.',
    requestedPriority: 'MEDIUM',
    itPriority: 'MEDIUM',
    currentStatus: 'OPEN',
    permittedNextStatuses: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
    ticketOwnerId: null,
    owner: null,
    requesterResolvedIndicator: false,
    resolutionSummary: null,
    reopenReason: null,
    publicCommentsCount: 0,
    internalNotesCount: 0,
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
  notes?: () => Response;
  extra?: (url: string, init?: RequestInit) => Response | undefined;
}) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(jsonResponse({ user: mockAuthUser }));
    }
    if (url.includes('/api/staff/users')) {
      return Promise.resolve(jsonResponse(mockStaffMembers));
    }
    const extra = handlers.extra?.(url, init);
    if (extra) return Promise.resolve(extra);
    if (url.includes('/notes') && (!init || init.method === undefined)) {
      return Promise.resolve(handlers.notes ? handlers.notes() : jsonResponse([]));
    }
    if (url.includes('/comments') && (!init || init.method === undefined)) {
      return Promise.resolve(handlers.comments ? handlers.comments() : jsonResponse([]));
    }
    if (url.match(/\/api\/staff\/tickets\/\d+$/)) {
      return Promise.resolve(handlers.ticket ? handlers.ticket() : jsonResponse(makeTicketDetail()));
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets/101']}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
          <Route path="/staff/tickets" element={<div>Staff Queue Screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-05/UI-06: IT Staff Ticket Detail (AC-06, AC-07, AC-08, AC-09, BR-04, BR-05)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the read-only overview fields', async () => {
    stubFetch({ ticket: () => jsonResponse(makeTicketDetail()) });
    renderDetail();

    expect(await screen.findByText('TKT-2026-000101')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toHaveValue('Hardware');
    expect(screen.getByLabelText('Related System')).toHaveValue('Corporate Laptop');
    expect(screen.getByText('Laptop battery drains quickly')).toBeInTheDocument();
  });

  it('UI-05: the Status dropdown only lists permitted next statuses', async () => {
    stubFetch({ ticket: () => jsonResponse(makeTicketDetail()) });
    renderDetail();

    await screen.findByText('TKT-2026-000101');
    const statusSelect = screen.getByLabelText('Status Workflow') as HTMLSelectElement;
    const optionLabels = Array.from(statusSelect.options).map((o) => o.textContent);

    expect(optionLabels).toContain('In Progress');
    expect(optionLabels).toContain('Waiting for Requester');
    expect(optionLabels).toContain('Cancelled');
    expect(optionLabels).not.toContain('Resolved');
    expect(optionLabels).not.toContain('Closed');
  });

  it('AC-06: Claim Ticket assigns the acting staff member as owner', async () => {
    const fetchMock = stubFetch({
      ticket: () => jsonResponse(makeTicketDetail()),
      extra: (url, init) => {
        if (url.includes('/owner') && init?.method === 'PATCH') {
          return jsonResponse({ id: 101, ticketOwnerId: 5, owner: mockStaffMembers[0] });
        }
        return undefined;
      },
    });
    renderDetail();

    await screen.findByText('TKT-2026-000101');
    fireEvent.click(screen.getByRole('button', { name: 'Claim Ticket' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/owner') && c[1]?.method === 'PATCH');
      expect(call).toBeDefined();
      expect(JSON.parse(call![1]!.body as string)).toEqual({ ticketOwnerId: 5 });
    });
  });

  it('AC-06: reassigning via the Owner dropdown calls PATCH owner with the selected id', async () => {
    const fetchMock = stubFetch({
      ticket: () => jsonResponse(makeTicketDetail()),
      extra: (url, init) => {
        if (url.includes('/owner') && init?.method === 'PATCH') {
          return jsonResponse({ id: 101, ticketOwnerId: 6, owner: mockStaffMembers[1] });
        }
        return undefined;
      },
    });
    renderDetail();

    await screen.findByText('TKT-2026-000101');
    fireEvent.change(screen.getByLabelText('Ticket Owner'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Owner' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/owner') && c[1]?.method === 'PATCH');
      expect(JSON.parse(call![1]!.body as string)).toEqual({ ticketOwnerId: 6 });
    });
  });

  it('AC-07: Save Priority calls PATCH priority with the selected value', async () => {
    const fetchMock = stubFetch({
      ticket: () => jsonResponse(makeTicketDetail()),
      extra: (url, init) => {
        if (url.includes('/priority') && init?.method === 'PATCH') {
          return jsonResponse({ id: 101, itPriority: 'HIGH' });
        }
        return undefined;
      },
    });
    renderDetail();

    await screen.findByText('TKT-2026-000101');
    fireEvent.change(screen.getByLabelText('IT Priority'), { target: { value: 'HIGH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Priority' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/priority') && c[1]?.method === 'PATCH');
      expect(JSON.parse(call![1]!.body as string)).toEqual({ itPriority: 'HIGH' });
    });
  });

  it('AC-08: a plain transition (no confirmation) saves immediately', async () => {
    const fetchMock = stubFetch({
      ticket: () => jsonResponse(makeTicketDetail()),
      extra: (url, init) => {
        if (url.includes('/status') && init?.method === 'PATCH') {
          return jsonResponse({ id: 101, currentStatus: 'IN_PROGRESS', resolutionSummary: null, reopenReason: null });
        }
        return undefined;
      },
    });
    renderDetail();

    await screen.findByText('TKT-2026-000101');
    fireEvent.change(screen.getByLabelText('Status Workflow'), { target: { value: 'IN_PROGRESS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Status' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/status') && c[1]?.method === 'PATCH');
      expect(call).toBeDefined();
    });
    expect(screen.queryByText(/Confirm transition/i)).not.toBeInTheDocument();
  });

  it('AC-08: transitioning to RESOLVED requires a confirmation with a resolutionSummary of at least 5 characters', async () => {
    const fetchMock = stubFetch({
      ticket: () => jsonResponse(makeTicketDetail({ currentStatus: 'IN_PROGRESS', permittedNextStatuses: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'] })),
      extra: (url, init) => {
        if (url.includes('/status') && init?.method === 'PATCH') {
          return jsonResponse({ id: 101, currentStatus: 'RESOLVED', resolutionSummary: 'Fixed it.', reopenReason: null });
        }
        return undefined;
      },
    });
    renderDetail();

    await screen.findByText('TKT-2026-000101');
    fireEvent.change(screen.getByLabelText('Status Workflow'), { target: { value: 'RESOLVED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Status' }));

    expect(await screen.findByText(/Confirm transition to Resolved/i)).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Resolution Summary/), { target: { value: 'ok' } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Resolution Summary/), { target: { value: 'Replaced the battery.' } });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/status') && c[1]?.method === 'PATCH');
      expect(JSON.parse(call![1]!.body as string)).toEqual(
        expect.objectContaining({ status: 'RESOLVED', resolutionSummary: 'Replaced the battery.' }),
      );
    });
  });

  it('shows the Requester Resolution Banner when requesterResolvedIndicator is true', async () => {
    stubFetch({ ticket: () => jsonResponse(makeTicketDetail({ requesterResolvedIndicator: true })) });
    renderDetail();

    expect(await screen.findByTestId('resolution-banner')).toHaveTextContent(/appears resolved/i);
  });

  describe('AC-09/UI-06: Public Comments vs Internal Notes visual distinction', () => {
    it('renders Public Comments and posts a new one', async () => {
      const fetchMock = stubFetch({
        ticket: () => jsonResponse(makeTicketDetail()),
        comments: () => jsonResponse([
          { id: 1, content: 'Any update?', createdAt: '2026-08-20T10:00:00.000Z', author: { id: 1, name: 'Jennifer Anderson', role: 'REQUESTER' } },
        ]),
        extra: (url, init) => {
          if (url.includes('/comments') && init?.method === 'POST') {
            return jsonResponse({ id: 2, content: JSON.parse(init.body as string).content, createdAt: '2026-08-20T11:00:00.000Z', author: { id: 5, name: 'Michael Brown', role: 'IT_STAFF' } });
          }
          return undefined;
        },
      });
      renderDetail();

      expect(await screen.findByText('Any update?')).toBeInTheDocument();
      expect(screen.getByText(/Comments posted here are visible to the Requester/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Add Public Comment/i), { target: { value: 'We are on it.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Post Comment' }));

      expect(await screen.findByText('We are on it.')).toBeInTheDocument();
      const postCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/comments') && c[1]?.method === 'POST');
      expect(postCall).toBeDefined();
    });

    it('renders Internal Notes with the lock warning banner and posts a new note, never mixing with comments', async () => {
      const fetchMock = stubFetch({
        ticket: () => jsonResponse(makeTicketDetail()),
        notes: () => jsonResponse([
          { id: 1, content: 'Escalated to vendor.', createdAt: '2026-08-20T10:00:00.000Z', author: { id: 5, name: 'Michael Brown', role: 'IT_STAFF' } },
        ]),
        extra: (url, init) => {
          if (url.includes('/notes') && init?.method === 'POST') {
            return jsonResponse({ id: 2, content: JSON.parse(init.body as string).content, createdAt: '2026-08-20T11:00:00.000Z', author: { id: 5, name: 'Michael Brown', role: 'IT_STAFF' } });
          }
          return undefined;
        },
      });
      renderDetail();

      expect(await screen.findByText(/Visible ONLY to IT Staff and Administrators/i)).toBeInTheDocument();
      expect(screen.getByText('Escalated to vendor.')).toBeInTheDocument();

      const notesSection = screen.getByTestId('internal-notes-section');
      expect(notesSection).toHaveClass('zg-internal-notes-panel');

      fireEvent.change(screen.getByLabelText(/Add Internal Note/i), { target: { value: 'Vendor confirmed fix.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Internal Note' }));

      expect(await screen.findByText('Vendor confirmed fix.')).toBeInTheDocument();
      const postCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/notes') && c[1]?.method === 'POST');
      expect(postCall).toBeDefined();

      // The Internal Note text must never appear inside the Public Comments section.
      const commentsSection = screen.getByTestId('public-comments-section');
      expect(commentsSection.textContent).not.toContain('Vendor confirmed fix.');
    });
  });

  it('lists attachments with a working Download action and a disabled control for removed files', async () => {
    stubFetch({
      ticket: () =>
        jsonResponse(
          makeTicketDetail({
            attachments: [
              { id: 1, ticketId: 101, originalFileName: 'screenshot.png', mimeType: 'image/png', fileSizeBytes: 2048, isRemoved: false, uploadedAt: '2026-08-20T09:20:00.000Z' },
              { id: 2, ticketId: 101, originalFileName: 'old.pdf', mimeType: 'application/pdf', fileSizeBytes: 1024, isRemoved: true, uploadedAt: '2026-08-20T09:20:00.000Z' },
            ],
          }),
        ),
    });
    renderDetail();

    expect(await screen.findByText('screenshot.png')).toBeInTheDocument();
    expect(screen.getByText('old.pdf')).toBeInTheDocument();

    const downloadButtons = screen.getAllByRole('button', { name: /Download/i });
    expect(downloadButtons[0]).toBeEnabled();
    expect(downloadButtons[1]).toBeDisabled();
  });
});
