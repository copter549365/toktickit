/**
 * client/tests/lab-04/AppShell.test.tsx
 *
 * Tests: UI-L4-10, Requester part (docs/lab-04/tests.md §2.6; FR-17, ui-spec §2).
 * The Requester nav is `Dashboard · My Tickets · Create Ticket`, the active item carries
 * aria-current="page", and `/` opens `/dashboard`. The IT Staff and Administrator nav changes
 * come with their dashboard (Issue 7).
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

  it('until their dashboard ships, IT Staff and Administrators keep their Lab 3 landing page', async () => {
    renderShell('IT_STAFF', '/');
    expect(await screen.findByText('Queue Marker')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('an Administrator opening /dashboard lands on User Management', async () => {
    renderShell('ADMINISTRATOR', '/dashboard');
    expect(await screen.findByText('Users Marker')).toBeInTheDocument();
  });
});
