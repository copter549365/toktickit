/**
 * client/tests/lab-04/ActionsTaken.test.tsx
 *
 * Tests: UI-L4-03 (create-form validation), UI-L4-04 (Requester read-only), UI-L4-05 (conflict,
 * double submit, retry), UI-L4-06 (view and edit modes) — docs/lab-04/tests.md §4,
 * docs/lab-04/ui-spec.md §5.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionsTakenSection } from '../../src/components/ActionsTakenSection';
import type { ActionTaken } from '../../src/types/actionTaken';

const MICHAEL = { id: 5, name: 'Michael Brown' };
const ALEX = { id: 6, name: 'Alex Thompson' };
const STAFF = [
  { ...MICHAEL, email: 'michael.brown@toktickit.com', role: 'IT_STAFF' as const },
  { ...ALEX, email: 'alex.thompson@toktickit.com', role: 'IT_STAFF' as const },
];
const TICKET_CREATED = '2026-10-01T00:00:00.000Z';

function makeAction(overrides: Partial<ActionTaken> = {}): ActionTaken {
  return {
    id: 31,
    ticketId: 101,
    actionAt: '2026-10-02T03:15:00.000Z',
    description: 'Checked the Wi-Fi driver version.',
    result: null,
    status: 'PLANNED',
    assignee: MICHAEL,
    performedBy: null,
    createdBy: MICHAEL,
    lastUpdatedBy: MICHAEL,
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    cancelReason: null,
    completedAt: null,
    version: 1,
    createdAt: '2026-10-02T03:16:00.000Z',
    updatedAt: '2026-10-02T03:16:00.000Z',
    ...overrides,
  };
}

const planned = makeAction();
const completed = makeAction({
  id: 32,
  actionAt: '2026-10-03T03:15:00.000Z',
  description: 'Reinstalled the VPN client.',
  result: 'VPN connects from home now.',
  status: 'COMPLETED',
  assignee: ALEX,
  performedBy: ALEX,
  completedAt: '2026-10-03T04:00:00.000Z',
  version: 3,
});

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;
let actions: ActionTaken[];

function stubFetch(handler?: Handler) {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const custom = handler?.(url, init);
    if (custom) return custom;
    if (url.endsWith('/api/tickets/101/actions') && !init?.method) {
      return jsonResponse({ data: actions, meta: { totalCount: actions.length, openCount: 0, completedCount: 0 } });
    }
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function calls(fetchMock: ReturnType<typeof vi.fn>, method: string) {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method);
}

function bodyOf(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string);
}

function renderStaff(props: Partial<Parameters<typeof ActionsTakenSection>[0]> = {}) {
  return render(
    <ActionsTakenSection
      ticketId={101}
      ticketCreatedAt={TICKET_CREATED}
      mode="staff"
      writable
      staffMembers={STAFF}
      currentUserId={MICHAEL.id}
      {...props}
    />,
  );
}

async function openCreateForm() {
  fireEvent.click(await screen.findByRole('button', { name: /Add Action/ }));
  return screen.findByRole('form', { name: 'Add Action' });
}

beforeEach(() => {
  actions = [planned, completed];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('UI-L4-03: create-form validation (AC-03, AC-04)', () => {
  it('shows a required Follow-up Note when the checkbox is checked, and blocks an empty note', async () => {
    const fetchMock = stubFetch();
    renderStaff();
    const form = await openCreateForm();
    expect(within(form).getByLabelText(/Description/)).toHaveFocus();
    expect(within(form).queryByLabelText(/Follow-up Note/)).not.toBeInTheDocument();

    const checkbox = within(form).getByLabelText('Follow-Up Required?');
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-expanded', 'true');
    const note = within(form).getByLabelText(/Follow-up Note/);
    expect(note).toHaveFocus();
    expect(checkbox).toHaveAttribute('aria-controls', note.id);

    fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: 'Swapped the battery.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Action' }));
    expect(await within(form).findByText('Follow-up note must be 5-1000 characters.')).toHaveAttribute('role', 'alert');
    expect(calls(fetchMock, 'POST')).toHaveLength(0);

    // Unchecking hides the field and discards its value (ui-spec §5.3).
    fireEvent.change(note, { target: { value: 'Check in a week.' } });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    expect(within(form).getByLabelText(/Follow-up Note/)).toHaveValue('');
  });

  it('marks Result required when Completed is selected and blocks an empty result', async () => {
    const fetchMock = stubFetch();
    renderStaff();
    const form = await openCreateForm();
    expect(within(form).getByRole('radio', { name: 'Planned' })).toBeChecked();

    fireEvent.click(within(form).getByRole('radio', { name: 'Completed' }));
    expect(within(form).getByLabelText(/Result/)).toBeRequired();
    fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: 'Swapped the battery.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Action' }));
    expect(await within(form).findByText('Result must be 5-2000 characters.')).toHaveAttribute('role', 'alert');
    expect(calls(fetchMock, 'POST')).toHaveLength(0);
  });

  it('rejects a short description and a future action time inline', async () => {
    stubFetch();
    renderStaff();
    const form = await openCreateForm();
    fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: 'abc' } });
    fireEvent.change(within(form).getByLabelText('Action date and time (Bangkok time)'), {
      target: { value: '2099-01-01T10:00' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Action' }));
    expect(await within(form).findByText('Description must be 5-2000 characters.')).toBeInTheDocument();
    expect(within(form).getByText('Action time cannot be in the future.')).toBeInTheDocument();
    expect(within(form).getByLabelText(/Description/)).toHaveClass('field-invalid');
  });

  it('shows a server INVALID_ASSIGNEE error under Assignee and keeps every typed value', async () => {
    stubFetch((_url, init) =>
      init?.method === 'POST'
        ? jsonResponse(
            { error: 'INVALID_ASSIGNEE', message: 'x', fieldErrors: { assigneeId: 'Choose an active IT Staff member or Administrator.' } },
            400,
          )
        : undefined,
    );
    renderStaff();
    const form = await openCreateForm();
    fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: 'Swapped the battery.' } });
    fireEvent.change(within(form).getByLabelText('Assignee'), { target: { value: String(ALEX.id) } });
    fireEvent.change(within(form).getByLabelText('Attachment Notes'), { target: { value: 'see photo.png' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Action' }));

    const error = await within(form).findByText('Choose an active IT Staff member or Administrator.');
    expect(error).toHaveAttribute('role', 'alert');
    expect(within(form).getByLabelText('Assignee')).toHaveAttribute('aria-describedby', error.id);
    expect(within(form).getByLabelText(/Description/)).toHaveValue('Swapped the battery.');
    expect(within(form).getByLabelText('Assignee')).toHaveValue(String(ALEX.id));
    expect(within(form).getByLabelText('Attachment Notes')).toHaveValue('see photo.png');
  });

  it('shows Performed by as a read-only ivory field', async () => {
    stubFetch();
    renderStaff();
    const form = await openCreateForm();
    const performed = within(form).getByLabelText('Performed by');
    expect(performed).toHaveAttribute('readonly');
    expect(performed).toHaveClass('field-readonly');
    expect(performed).toHaveValue('Set automatically when completed');
  });
});

describe('UI-L4-04: Requester read-only mode (AC-08, BR-10)', () => {
  it('renders the list with no Add, Edit, or status controls in the DOM', async () => {
    stubFetch();
    render(<ActionsTakenSection ticketId={101} ticketCreatedAt={TICKET_CREATED} mode="requester" writable />);
    const table = await screen.findByRole('table');
    // At tablet width Result is merged into the Description cell (ui-spec §9), so it is rendered twice.
    expect(within(table).getByText('Checked the Wi-Fi driver version.')).toBeInTheDocument();
    expect(within(table).getAllByText('VPN connects from home now.').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Actions Taken (2)' })).toBeInTheDocument();
    expect(screen.getByText('Visible to Requester')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Add Action/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add the first action/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('shows the empty state without an Add button', async () => {
    actions = [];
    stubFetch();
    render(<ActionsTakenSection ticketId={101} ticketCreatedAt={TICKET_CREATED} mode="requester" writable />);
    expect(await screen.findAllByText('No actions recorded yet.')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Add the first action/ })).not.toBeInTheDocument();
  });

  it('a Requester view drawer has no Edit or status buttons', async () => {
    stubFetch();
    render(<ActionsTakenSection ticketId={101} ticketCreatedAt={TICKET_CREATED} mode="requester" writable />);
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getAllByRole('button', { name: /View/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Action #31' });
    expect(within(dialog).queryByRole('button', { name: /Edit|Start|Mark Completed|Cancel Action/ })).not.toBeInTheDocument();
  });
});

describe('UI-L4-05: conflict, double submit, retry (AC-07, AC-25, FR-20, FR-21)', () => {
  async function fillValidCreate(form: HTMLElement) {
    fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: 'Swapped the battery.' } });
  }

  it('a double click on Save Action sends one POST', async () => {
    let resolvePost: (r: Response) => void = () => {};
    const fetchMock = stubFetch((_url, init) =>
      init?.method === 'POST' ? new Promise<Response>((r) => (resolvePost = r)) : undefined,
    );
    renderStaff();
    const form = await openCreateForm();
    await fillValidCreate(form);
    const save = within(form).getByRole('button', { name: 'Save Action' });
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.submit(form);
    expect(calls(fetchMock, 'POST')).toHaveLength(1);
    await waitFor(() => expect(within(form).getByRole('button', { name: /Saving/ })).toBeDisabled());

    const created = makeAction({ id: 40, description: 'Swapped the battery.' });
    actions = [planned, completed, created];
    resolvePost(jsonResponse({ data: created }, 201));
    expect(await screen.findByRole('status')).toHaveTextContent('Action added');
    expect(screen.queryByRole('form', { name: 'Add Action' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-action-id', '40'));
  });

  it('a retry after a network error re-sends the same clientRequestId and keeps the draft', async () => {
    let attempt = 0;
    const fetchMock = stubFetch((_url, init) => {
      if (init?.method !== 'POST') return undefined;
      attempt += 1;
      if (attempt === 1) return Promise.reject(new TypeError('Failed to fetch'));
      return jsonResponse({ data: makeAction({ id: 41 }) }, 201);
    });
    renderStaff();
    const form = await openCreateForm();
    await fillValidCreate(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Save Action' }));
    expect(await within(form).findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(within(form).getByLabelText(/Description/)).toHaveValue('Swapped the battery.');

    fireEvent.click(within(form).getByRole('button', { name: 'Save Action' }));
    await waitFor(() => expect(calls(fetchMock, 'POST')).toHaveLength(2));
    const [first, second] = calls(fetchMock, 'POST').map(bodyOf);
    expect(first.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.clientRequestId).toBe(first.clientRequestId);
  });

  it('a 409 STALE_UPDATE shows the banner, keeps the draft, and saves again after Reload latest', async () => {
    let patches = 0;
    const fetchMock = stubFetch((_url, init) => {
      if (init?.method !== 'PATCH') return undefined;
      patches += 1;
      if (patches === 1) {
        actions = [makeAction({ description: 'Someone else edited this.', version: 2 }), completed];
        return jsonResponse({ error: 'STALE_UPDATE', message: 'x', currentVersion: 2 }, 409);
      }
      return jsonResponse({ data: makeAction({ description: 'My edited description.', version: 3 }) });
    });
    renderStaff();
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: 'Edit action #31' }));
    const dialog = await screen.findByRole('dialog', { name: 'Action #31' });
    fireEvent.change(within(dialog).getByLabelText(/Description/), { target: { value: 'My edited description.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    const banner = await within(dialog).findByText('Someone else updated this action. Your changes are kept below.');
    expect(banner.closest('[role="alert"]')).toHaveClass('zg-conflict-banner');
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue('My edited description.');
    expect(bodyOf(calls(fetchMock, 'PATCH')[0])).toEqual({ expectedVersion: 1, description: 'My edited description.' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reload latest' }));
    expect(await within(dialog).findByText('Someone else edited this.')).toBeInTheDocument(); // latest, side by side
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue('My edited description.');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH')).toHaveLength(2));
    expect(bodyOf(calls(fetchMock, 'PATCH')[1])).toEqual({ expectedVersion: 2, description: 'My edited description.' });
  });

  it('Discard my changes resets the draft to the latest version', async () => {
    stubFetch((_url, init) => {
      if (init?.method !== 'PATCH') return undefined;
      actions = [makeAction({ description: 'Someone else edited this.', version: 2 }), completed];
      return jsonResponse({ error: 'STALE_UPDATE', message: 'x', currentVersion: 2 }, 409);
    });
    renderStaff();
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: 'Edit action #31' }));
    const dialog = await screen.findByRole('dialog', { name: 'Action #31' });
    fireEvent.change(within(dialog).getByLabelText(/Description/), { target: { value: 'My edited description.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Discard my changes' }));
    await waitFor(() => expect(within(dialog).queryByText(/Someone else updated/)).not.toBeInTheDocument());
    expect(within(dialog).getByText('Someone else edited this.')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Description/)).not.toBeInTheDocument(); // back in view mode
  });
});

describe('UI-L4-06: view and edit modes (AC-05, AC-06)', () => {
  it('View opens a read-only, labelled, focus-managed dialog; Esc closes it and returns focus', async () => {
    stubFetch();
    renderStaff();
    const table = await screen.findByRole('table');
    const viewButton = within(table).getByRole('button', { name: 'View action #32' });
    viewButton.focus();
    fireEvent.click(viewButton);

    const dialog = await screen.findByRole('dialog', { name: 'Action #32' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(dialog).getByText('VPN connects from home now.')).toHaveClass('field-readonly');
    expect(within(dialog).getByText('Completed actions are read-only')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(viewButton).toHaveFocus();
  });

  it('offers Edit only for open actions', async () => {
    stubFetch();
    renderStaff();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('button', { name: 'Edit action #31' })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Edit action #32' })).not.toBeInTheDocument();
  });

  it('hides Add and Edit when the ticket is not writable (BR-09)', async () => {
    stubFetch();
    renderStaff({ writable: false });
    const table = await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Add Action/ })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('Start moves a Planned action to In Progress', async () => {
    const fetchMock = stubFetch((_url, init) =>
      init?.method === 'PATCH' ? jsonResponse({ data: makeAction({ status: 'IN_PROGRESS', version: 2 }) }) : undefined,
    );
    renderStaff();
    fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Edit action #31' }));
    const dialog = await screen.findByRole('dialog', { name: 'Action #31' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH')).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'PATCH')[0])).toEqual({ expectedVersion: 1, status: 'IN_PROGRESS' });
  });

  it('Mark Completed requires a Result, then confirms inline', async () => {
    const fetchMock = stubFetch((_url, init) =>
      init?.method === 'PATCH'
        ? jsonResponse({ data: makeAction({ status: 'COMPLETED', result: 'Battery replaced.', performedBy: MICHAEL, version: 2 }) })
        : undefined,
    );
    renderStaff();
    fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Edit action #31' }));
    const dialog = await screen.findByRole('dialog', { name: 'Action #31' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Completed' }));
    expect(await within(dialog).findByText('Result must be 5-2000 characters.')).toHaveAttribute('role', 'alert');
    expect(calls(fetchMock, 'PATCH')).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText(/Result/), { target: { value: 'Battery replaced.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Completed' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Confirm Completion' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH')).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'PATCH')[0])).toEqual({
      expectedVersion: 1,
      status: 'COMPLETED',
      result: 'Battery replaced.',
    });
  });

  it('Cancel Action opens a modal that requires a 5+ character reason', async () => {
    const fetchMock = stubFetch((_url, init) =>
      init?.method === 'PATCH'
        ? jsonResponse({ data: makeAction({ status: 'CANCELLED', cancelReason: 'Duplicate entry.', version: 2 }) })
        : undefined,
    );
    renderStaff();
    fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Edit action #31' }));
    const drawer = await screen.findByRole('dialog', { name: 'Action #31' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancel Action' }));

    const modal = await screen.findByRole('dialog', { name: 'Cancel Action' });
    expect(within(modal).getByLabelText(/Reason for cancelling/)).toHaveFocus();
    fireEvent.change(within(modal).getByLabelText(/Reason for cancelling/), { target: { value: 'dup' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm Cancel' }));
    expect(await within(modal).findByText('Cancel reason must be 5-500 characters.')).toHaveAttribute('role', 'alert');
    expect(calls(fetchMock, 'PATCH')).toHaveLength(0);

    fireEvent.change(within(modal).getByLabelText(/Reason for cancelling/), { target: { value: 'Duplicate entry.' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm Cancel' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH')).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'PATCH')[0])).toEqual({
      expectedVersion: 1,
      status: 'CANCELLED',
      cancelReason: 'Duplicate entry.',
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cancel Action' })).not.toBeInTheDocument());
  });

  it('shows status badges with text and icon, never color alone', async () => {
    stubFetch();
    renderStaff();
    const table = await screen.findByRole('table');
    const badge = within(table).getByText('Completed');
    expect(badge.closest('.zg-badge')).toHaveClass('badge-action-completed');
    expect(badge.closest('.zg-badge')).toHaveTextContent('✓');
    expect(within(table).getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(table.querySelector('caption')).not.toBeNull();
  });
});
