import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { RequireAuth } from '../../src/components/RequireAuth';
import { RequireRole } from '../../src/components/RequireRole';

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

function renderAt(path: string, role: Role) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: 1, name: 'Test User', email: 'test@toktickit.com', role, mustChangePassword: false },
      }),
    } as Response),
  );

  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route element={<RequireRole roles={['ADMINISTRATOR']} />}>
              <Route path="admin/users" element={<div>User Management Marker</div>} />
            </Route>
            <Route element={<RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']} />}>
              <Route path="staff/tickets" element={<div>Ticket Queue Marker</div>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-16: Role-gated routes show a forbidden state (FR-08, FR-09, AC-14)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the Administrator screen for an Administrator', async () => {
    renderAt('/admin/users', 'ADMINISTRATOR');
    expect(await screen.findByText('User Management Marker')).toBeInTheDocument();
  });

  it.each<Role>(['REQUESTER', 'IT_STAFF'])('shows a forbidden state, not the screen, to a %s on /admin/users', async (role) => {
    renderAt('/admin/users', role);
    expect(await screen.findByText('You do not have permission to view this page.')).toBeInTheDocument();
    expect(screen.queryByText('User Management Marker')).not.toBeInTheDocument();
  });

  it('shows a forbidden state to a Requester on the IT Staff queue', async () => {
    renderAt('/staff/tickets', 'REQUESTER');
    expect(await screen.findByTestId('forbidden-state')).toBeInTheDocument();
    expect(screen.queryByText('Ticket Queue Marker')).not.toBeInTheDocument();
  });

  it('allows an Administrator into the IT Staff queue (server permits IT_STAFF and ADMINISTRATOR)', async () => {
    renderAt('/staff/tickets', 'ADMINISTRATOR');
    expect(await screen.findByText('Ticket Queue Marker')).toBeInTheDocument();
  });
});
