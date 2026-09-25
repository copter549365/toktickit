import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { UserManagement } from '../../src/screens/UserManagement';

const mockAdmin = {
  id: 1,
  name: 'John Smith',
  email: 'john.smith@toktickit.com',
  role: 'ADMINISTRATOR',
  mustChangePassword: false,
};

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 2,
    name: 'Jane Doe',
    email: 'jane.doe@toktickit.com',
    role: 'IT_STAFF',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-08-20T09:14:00.000Z',
    ...overrides,
  };
}

async function findInTable(text: string) {
  const table = await screen.findByTestId('user-management-table');
  return within(table).findByText(text);
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <AuthProvider>
        <UserManagement />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-07: Admin User Management (AC-10, AC-12, AC-16, AC-17)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubFetch(usersHandler: (url: string, init?: RequestInit) => Promise<Response>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) {
          return Promise.resolve({ ok: true, json: async () => ({ user: mockAdmin }) } as Response);
        }
        if (url.includes('/api/admin/users')) {
          return usersHandler(url, init);
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }),
    );
  }

  it('renders the user list with name, email, role, and status', async () => {
    stubFetch((url) => {
      if (url.includes('/reset-password')) {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [makeUser()] } as Response);
    });

    renderScreen();

    expect(await findInTable('Jane Doe')).toBeInTheDocument();
    expect(await findInTable('jane.doe@toktickit.com')).toBeInTheDocument();
    expect(await findInTable('IT Staff')).toBeInTheDocument();
    expect(await findInTable('Active')).toBeInTheDocument();
  });

  it('searching re-queries the API with the search term', async () => {
    stubFetch(() => Promise.resolve({ ok: true, json: async () => [makeUser()] } as Response));

    renderScreen();
    await findInTable('Jane Doe');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'jane' } });

    await waitFor(
      () => {
        const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: any[]) =>
          (call[0] as string).includes('/api/admin/users'),
        );
        expect(calls.some((call: any[]) => (call[0] as string).includes('search=jane'))).toBe(true);
      },
      { timeout: 2000 },
    );
  });

  it('filtering by role re-queries the API with the role filter', async () => {
    stubFetch(() => Promise.resolve({ ok: true, json: async () => [makeUser()] } as Response));

    renderScreen();
    await findInTable('Jane Doe');

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'ADMINISTRATOR' } });

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: any[]) =>
        (call[0] as string).includes('/api/admin/users'),
      );
      expect(calls.some((call: any[]) => (call[0] as string).includes('role=ADMINISTRATOR'))).toBe(true);
    });
  });

  it('creating a new user submits the form and refreshes the list', async () => {
    let createCalled = false;
    stubFetch((url, init) => {
      if (init?.method === 'POST' && url.includes('/api/admin/users')) {
        createCalled = true;
        return Promise.resolve({ ok: true, json: async () => makeUser({ id: 3, name: 'New Person' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [makeUser()] } as Response);
    });

    renderScreen();
    await findInTable('Jane Doe');

    fireEvent.click(screen.getByRole('button', { name: 'Create New User' }));

    fireEvent.change(screen.getByLabelText('Full Name', { exact: false }), { target: { value: 'New Person' } });
    fireEvent.change(screen.getByLabelText('Email Address', { exact: false }), {
      target: { value: 'new.person@toktickit.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save User' }));

    await waitFor(() => expect(createCalled).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create New User' })).not.toBeInTheDocument());
  });

  it('disables the Active toggle when an Administrator edits their own account (self-deactivation guard)', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => [makeUser({ ...mockAdmin, isActive: true })],
      } as Response),
    );

    renderScreen();
    await findInTable('John Smith');

    fireEvent.click(screen.getByRole('button', { name: 'Edit User' }));

    const activeToggle = await screen.findByLabelText('Active');
    expect(activeToggle).toBeDisabled();
    expect(screen.getByText('You cannot deactivate your own account.')).toBeInTheDocument();
  });

  it('disables the Active toggle and Role select when editing the last active Administrator', async () => {
    const otherAdmin = makeUser({ id: 9, name: 'Sole Admin', email: 'sole.admin@toktickit.com', role: 'ADMINISTRATOR', isActive: true });
    stubFetch(() => Promise.resolve({ ok: true, json: async () => [otherAdmin] } as Response));

    renderScreen();
    await findInTable('Sole Admin');

    fireEvent.click(screen.getByRole('button', { name: 'Edit User' }));

    const activeToggle = await screen.findByLabelText('Active');
    expect(activeToggle).toBeDisabled();
    const dialog = screen.getByRole('dialog', { name: 'Edit User' });
    expect(within(dialog).getByLabelText('Role', { exact: false })).toBeDisabled();
    expect(screen.getByText('The last active Administrator cannot be deactivated.')).toBeInTheDocument();
  });

  it('does not disable the Active toggle when editing a non-admin or a non-sole admin', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        json: async () => [makeUser(), makeUser({ ...mockAdmin, isActive: true })],
      } as Response),
    );

    renderScreen();
    await findInTable('Jane Doe');

    const editButtons = await screen.findAllByRole('button', { name: 'Edit User' });
    fireEvent.click(editButtons[0]);

    const activeToggle = await screen.findByLabelText('Active');
    expect(activeToggle).not.toBeDisabled();
  });

  it('updating a user submits the edit form and refreshes the list', async () => {
    let patchCalled = false;
    stubFetch((_url, init) => {
      if (init?.method === 'PATCH') {
        patchCalled = true;
        return Promise.resolve({ ok: true, json: async () => makeUser({ name: 'Jane Updated' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [makeUser()] } as Response);
    });

    renderScreen();
    await findInTable('Jane Doe');

    fireEvent.click(screen.getByRole('button', { name: 'Edit User' }));
    fireEvent.change(await screen.findByLabelText('Full Name', { exact: false }), {
      target: { value: 'Jane Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(patchCalled).toBe(true));
  });
});
