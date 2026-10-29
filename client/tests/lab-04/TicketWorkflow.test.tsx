/**
 * client/tests/lab-04/TicketWorkflow.test.tsx
 *
 * Tests: UI-L4-07 (docs/lab-04/tests.md §2.6) — the status control offers only
 * permittedNextStatuses; the Resolve modal checklist blocks Confirm while unmet; a 409 gate
 * refreshes the checklist and keeps the summary; success refreshes badge, history and actions;
 * stale writes show the conflict banner; Status History on both detail screens (ui-spec §6).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { StaffTicketDetail } from '../../src/screens/StaffTicketDetail';
import { RequesterTicketDetail } from '../../src/screens/RequesterTicketDetail';
import { StatusHistory } from '../../src/components/StatusHistory';

const staffUser = { id: 5, name: 'Michael Brown', email: 'michael.brown@toktickit.com', role: 'IT_STAFF', mustChangePassword: false };
const requesterUser = { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com', role: 'REQUESTER', mustChangePassword: false };

const gateMet = {
  met: true,
  conditions: [
    { key: 'HAS_OWNER', met: true, label: 'Ticket has an owner' },
    { key: 'HAS_COMPLETED_ACTION', met: true, label: 'At least one action is completed' },
    { key: 'NO_OPEN_ACTIONS', met: true, label: 'No planned or in-progress actions remain' },
  ],
  warnings: ['1 completed action requires follow-up'],
};
const gateBlocked = {
  ...gateMet,
  met: false,
  conditions: gateMet.conditions.map((c) => (c.key === 'NO_OPEN_ACTIONS' ? { ...c, met: false } : c)),
  warnings: [],
};

function makeTicket(overrides: Record<string, unknown> = {}) {
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
    currentStatus: 'IN_PROGRESS',
    permittedNextStatuses: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    ticketOwnerId: 5,
    owner: { id: 5, name: 'Michael Brown', email: 'michael.brown@toktickit.com' },
    requesterResolvedIndicator: false,
    resolutionSummary: null,
    reopenReason: null,
    publicCommentsCount: 0,
    internalNotesCount: 0,
    createdAt: '2026-10-01T02:00:00.000Z',
    updatedAt: '2026-10-02T02:00:00.000Z',
    attachments: [],
    version: 4,
    resolvedAt: null,
    resolutionGate: gateMet,
    ...overrides,
  };
}

const historyRows = [
  { id: 1, fromStatus: null, toStatus: 'NEW', changedBy: null, note: 'Status at Lab 4 migration', isMigrated: true, createdAt: '2026-10-01T02:00:00.000Z' },
  { id: 2, fromStatus: 'NEW', toStatus: 'IN_PROGRESS', changedBy: { id: 5, name: 'Michael Brown' }, note: null, isMigrated: false, createdAt: '2026-10-02T02:00:00.000Z' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

interface State {
  ticket: ReturnType<typeof makeTicket>;
  history: typeof historyRows;
  onStatus?: (body: Record<string, unknown>) => Response;
}

function stubStaff(state: State) {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('/api/auth/me')) return jsonResponse({ user: staffUser });
    if (url.includes('/api/staff/users')) return jsonResponse([{ ...staffUser, role: 'IT_STAFF' }]);
    if (url.includes('/status-history')) return jsonResponse({ data: state.history });
    if (url.includes('/actions')) return jsonResponse({ data: [], meta: { totalCount: 0, openCount: 0, completedCount: 0 } });
    if (url.includes('/status') && init?.method === 'PATCH') {
      return state.onStatus!(JSON.parse(init.body as string));
    }
    if (url.match(/\/api\/staff\/tickets\/\d+$/)) return jsonResponse(state.ticket);
    return jsonResponse([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderStaff() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets/101']}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function openResolveModal() {
  const select = await screen.findByLabelText('Status Workflow');
  fireEvent.change(select, { target: { value: 'RESOLVED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Status' }));
  return screen.findByRole('dialog', { name: 'Confirm transition to Resolved' });
}

function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/status') && (init as RequestInit)?.method === 'PATCH');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UI-L4-07: status control and Resolve modal (AC-17, AC-12)', () => {
  it('offers exactly permittedNextStatuses, and "No further changes" when there are none', async () => {
    stubStaff({ ticket: makeTicket(), history: historyRows });
    const { unmount } = renderStaff();
    const select = await screen.findByLabelText('Status Workflow');
    const offered = within(select).getAllByRole('option').filter((o) => !(o as HTMLOptionElement).disabled);
    expect(offered.map((o) => o.textContent)).toEqual(['Waiting for Requester', 'Resolved', 'Cancelled']);
    unmount();

    stubStaff({ ticket: makeTicket({ currentStatus: 'CLOSED', permittedNextStatuses: [] }), history: historyRows });
    renderStaff();
    expect(await screen.findByText('No further changes')).toBeInTheDocument();
    expect(screen.queryByLabelText('Status Workflow')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Status' })).not.toBeInTheDocument();
  });

  it('the checklist uses icon and text, shows warnings, and disables Confirm while a condition is unmet', async () => {
    stubStaff({ ticket: makeTicket({ resolutionGate: gateBlocked }), history: historyRows });
    renderStaff();
    const modal = await openResolveModal();
    const checklist = within(modal).getByRole('list', { name: 'Resolution checklist' });
    expect(within(checklist).getByText('No planned or in-progress actions remain').closest('li')).toHaveTextContent('✗');
    expect(within(checklist).getByText('Ticket has an owner').closest('li')).toHaveTextContent('✓');
    expect(within(modal).getByRole('link', { name: 'Go to Actions Taken' })).toHaveAttribute('href', '#actions-taken');

    fireEvent.change(within(modal).getByLabelText(/Resolution Summary/), { target: { value: 'Replaced the battery.' } });
    expect(within(modal).getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('shows follow-up warnings without blocking (D-06)', async () => {
    stubStaff({ ticket: makeTicket(), history: historyRows });
    renderStaff();
    const modal = await openResolveModal();
    expect(within(modal).getByText('1 completed action requires follow-up').closest('li')).toHaveTextContent('⚑');
    fireEvent.change(within(modal).getByLabelText(/Resolution Summary/), { target: { value: 'Replaced the battery.' } });
    expect(within(modal).getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('a 409 gate response refreshes the checklist from the error body and keeps the summary', async () => {
    const fetchMock = stubStaff({
      ticket: makeTicket(),
      history: historyRows,
      onStatus: () =>
        jsonResponse(
          {
            error: 'RESOLUTION_GATE_NOT_MET',
            message: 'This ticket cannot be resolved yet.',
            unmetConditions: [{ key: 'NO_OPEN_ACTIONS', label: 'No planned or in-progress actions remain' }],
          },
          409,
        ),
    });
    renderStaff();
    const modal = await openResolveModal();
    fireEvent.change(within(modal).getByLabelText(/Resolution Summary/), { target: { value: 'Replaced the battery.' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm' }));

    expect(await within(modal).findByText(/someone added or reopened an action/i)).toBeInTheDocument();
    const checklist = within(modal).getByRole('list', { name: 'Resolution checklist' });
    expect(within(checklist).getByText('No planned or in-progress actions remain').closest('li')).toHaveTextContent('✗');
    expect(within(modal).getByLabelText(/Resolution Summary/)).toHaveValue('Replaced the battery.');
    expect(within(modal).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(JSON.parse(patchCalls(fetchMock)[0][1].body)).toEqual({
      status: 'RESOLVED',
      resolutionSummary: 'Replaced the battery.',
      expectedVersion: 4,
    });
  });

  it('success refreshes the badge, permitted list, history and shows a toast without a page reload', async () => {
    const state: State = { ticket: makeTicket(), history: historyRows };
    state.onStatus = (body) => {
      state.ticket = makeTicket({ currentStatus: 'RESOLVED', permittedNextStatuses: ['CLOSED', 'REOPENED'], version: 5 });
      state.history = [
        ...historyRows,
        { id: 3, fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED', changedBy: { id: 5, name: 'Michael Brown' }, note: body.resolutionSummary as string, isMigrated: false, createdAt: '2026-10-03T02:00:00.000Z' },
      ] as typeof historyRows;
      return jsonResponse({ id: 101, currentStatus: 'RESOLVED', version: 5 });
    };
    stubStaff(state);
    renderStaff();
    const modal = await openResolveModal();
    fireEvent.change(within(modal).getByLabelText(/Resolution Summary/), { target: { value: 'Replaced the battery.' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Status changed to Resolved')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const history = screen.getByRole('region', { name: /Status History/ });
    expect(await within(history).findByText('Replaced the battery.')).toBeInTheDocument();
    const select = screen.getByLabelText('Status Workflow');
    const offered = within(select).getAllByRole('option').filter((o) => !(o as HTMLOptionElement).disabled);
    expect(offered.map((o) => o.textContent)).toEqual(['Closed', 'Reopened']);
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveTextContent('Resolved');
  });

  it('a 409 STALE_UPDATE shows the amber conflict banner with Reload latest', async () => {
    const state: State = {
      ticket: makeTicket(),
      history: historyRows,
      onStatus: () => jsonResponse({ error: 'STALE_UPDATE', message: 'x', currentVersion: 5 }, 409),
    };
    const fetchMock = stubStaff(state);
    renderStaff();
    const select = await screen.findByLabelText('Status Workflow');
    fireEvent.change(select, { target: { value: 'WAITING_FOR_REQUESTER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Status' }));

    const banner = await screen.findByText('This ticket was changed by someone else. Reload to see the latest version.');
    expect(banner.closest('[role="alert"]')).toHaveClass('zg-conflict-banner');
    state.ticket = makeTicket({ version: 5, currentStatus: 'WAITING_FOR_REQUESTER', permittedNextStatuses: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'] });
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
    await waitFor(() => expect(screen.queryByText(/changed by someone else/)).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).match(/\/api\/staff\/tickets\/101$/)).length).toBeGreaterThan(1);
  });

  it('shows the "Requester says resolved" pill in the header when the flag is set (ui-spec §6.5)', async () => {
    stubStaff({ ticket: makeTicket({ requesterResolvedIndicator: true }), history: historyRows });
    renderStaff();
    expect(await screen.findByText('Requester says resolved')).toBeInTheDocument();
  });
});

describe('UI-L4-07: Status History (AC-14, ui-spec §6.4)', () => {
  it('renders entries oldest first with actor, note, and a Migrated tag, and can collapse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: historyRows })));
    render(<StatusHistory ticketId={101} />);
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('New');
    expect(items[0]).toHaveTextContent('Migrated');
    expect(items[0]).toHaveTextContent('Status at Lab 4 migration');
    expect(items[1]).toHaveTextContent('New → In Progress');
    expect(items[1]).toHaveTextContent('Michael Brown');
    expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Status History/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('the Requester detail screen shows the history read-only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/auth/me')) return jsonResponse({ user: requesterUser });
        if (url.includes('/status-history')) return jsonResponse({ data: historyRows });
        if (url.includes('/actions')) return jsonResponse({ data: [], meta: { totalCount: 0, openCount: 0, completedCount: 0 } });
        if (url.includes('/comments')) return jsonResponse([]);
        if (url.match(/\/api\/tickets\/\d+$/)) {
          return jsonResponse({ ...makeTicket(), requesterId: 1, ticketOwnerName: 'Michael Brown', resolutionGate: undefined, permittedNextStatuses: [] });
        }
        return jsonResponse([]);
      }),
    );
    render(
      <MemoryRouter initialEntries={['/tickets/101']}>
        <AuthProvider>
          <Routes>
            <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    const history = await screen.findByRole('region', { name: /Status History/ });
    expect(await within(history).findByText('New → In Progress')).toBeInTheDocument();
  });
});
