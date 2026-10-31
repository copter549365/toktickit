/**
 * client/tests/lab-04/AppShell.test.tsx
 *
 * Tests: UI-L4-10 (docs/lab-04/tests.md §2.6; FR-17, ui-spec §2).
 * The Requester nav is `Dashboard · My Tickets · Create Ticket`, the active item carries
 * aria-current="page", and `/` opens `/dashboard`. IT Staff get `Dashboard · Ticket Queue` and
 * Administrators `Dashboard · Ticket Queue · User Management` (Issue 7, BR-29).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { RequireAuth } from '../../src/components/RequireAuth';
import { AppShell } from '../../src/components/AppShell';
import { DashboardHome } from '../../src/screens/Dashboard';

const users = {
  REQUESTER: { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com', role: 'REQUESTER', mustChangePassword: false },
  IT_STAFF: { id: 5, name: 'Michael Brown', email: 'michael.brown@toktickit.com', role: 'IT_STAFF', mustChangePassword: false },
  ADMINISTRATOR: { id: 9, name: 'John Smith', email: 'john.smith@toktickit.com', role: 'ADMINISTRATOR', mustChangePassword: false },
};

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderShell(role: keyof typeof users, entry: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/me')) return jsonResponse({ user: users[role] });
      return new Promise(() => {}); // screens stay loading; only the shell is under test
    }),
  );
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <LocationProbe />
        <Routes>
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardHome />} />
              <Route path="tickets" element={<div>My Tickets Marker</div>} />
              <Route path="tickets/new" element={<div>Create Ticket Marker</div>} />
              <Route path="staff/tickets" element={<div>Queue Marker</div>} />
              <Route path="admin/users" element={<div>Users Marker</div>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const navLinks = () => within(screen.getByRole('banner')).getAllByRole('link');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UI-L4-10: AppShell Dashboard navigation (FR-17)', () => {
  it('the Requester nav order is Dashboard · My Tickets · Create Ticket', async () => {
    renderShell('REQUESTER', '/tickets');
    await screen.findByText('My Tickets Marker');
    expect(navLinks().map((l) => l.textContent)).toEqual(['Dashboard', 'My Tickets', 'Create Ticket']);
  });

  it('marks only the active item with aria-current="page"', async () => {
    renderShell('REQUESTER', '/dashboard');
    const dashboard = await screen.findByRole('link', { name: 'Dashboard' });
    await waitFor(() => expect(dashboard).toHaveAttribute('aria-current', 'page'));
    expect(screen.getByRole('link', { name: 'My Tickets' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Create Ticket' })).not.toHaveAttribute('aria-current');
  });

  it('My Tickets is not marked active on the Create Ticket screen', async () => {
    renderShell('REQUESTER', '/tickets/new');
    await screen.findByText('Create Ticket Marker');
    expect(screen.getByRole('link', { name: 'Create Ticket' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'My Tickets' })).not.toHaveAttribute('aria-current');
  });

  it('`/` opens /dashboard, which renders the Requester Dashboard', async () => {
    renderShell('REQUESTER', '/');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(await screen.findByTestId('dashboard-loading')).toBeInTheDocument();
  });

  it('the IT Staff nav order is Dashboard · Ticket Queue', async () => {
    renderShell('IT_STAFF', '/staff/tickets');
    await screen.findByText('Queue Marker');
    expect(navLinks().map((l) => l.textContent)).toEqual(['Dashboard', 'Ticket Queue']);
    expect(screen.getByRole('link', { name: 'Ticket Queue' })).toHaveAttribute('aria-current', 'page');
  });

  it('the Administrator nav order is Dashboard · Ticket Queue · User Management (BR-29)', async () => {
    renderShell('ADMINISTRATOR', '/admin/users');
    await screen.findByText('Users Marker');
    expect(navLinks().map((l) => l.textContent)).toEqual(['Dashboard', 'Ticket Queue', 'User Management']);
    expect(screen.getByRole('link', { name: 'User Management' })).toHaveAttribute('aria-current', 'page');
  });

  it.each(['IT_STAFF', 'ADMINISTRATOR'] as const)('`/` opens /dashboard for %s, which renders the staff dashboard', async (role) => {
    renderShell(role, '/');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(await screen.findByRole('heading', { level: 1, name: /^Welcome back, / })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });
});
