import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { RequireAuth } from '../../src/components/RequireAuth';
import { AppShell } from '../../src/components/AppShell';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function renderShell(meResponse: unknown, extraMock?: () => Response) {
  const fetchMock = extraMock
    ? vi.fn().mockResolvedValueOnce(jsonResponse(meResponse, meResponse === null ? 401 : 200)).mockImplementation(extraMock)
    : vi.fn().mockResolvedValue(jsonResponse(meResponse, meResponse === null ? 401 : 200));
  vi.stubGlobal('fetch', fetchMock);

  render(
    <MemoryRouter initialEntries={['/tickets']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Marker</div>} />
          <Route path="/change-password" element={<div>Change Password Marker</div>} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="tickets" element={<div>My Tickets Marker</div>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

  return fetchMock;
}

describe('UI-03: App Shell — role display and navigation (FR-08, FR-09)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('AC-01: redirects to /login when unauthenticated', async () => {
    renderShell(null);
    expect(await screen.findByText('Login Marker')).toBeInTheDocument();
  });

  it('AC-02: redirects to /change-password when mustChangePassword is true', async () => {
    renderShell({
      user: {
        id: 1,
        name: 'Jennifer Anderson',
        email: 'jennifer.anderson@toktickit.com',
        role: 'REQUESTER',
        mustChangePassword: true,
      },
    });
    expect(await screen.findByText('Change Password Marker')).toBeInTheDocument();
  });

  it('shows the Requester name, role badge, and Requester navigation', async () => {
    renderShell({
      user: {
        id: 1,
        name: 'Jennifer Anderson',
        email: 'jennifer.anderson@toktickit.com',
        role: 'REQUESTER',
        mustChangePassword: false,
      },
    });

    await waitFor(() => expect(screen.getByTestId('auth-user-name')).toHaveTextContent('Jennifer Anderson'));
    expect(screen.getByText('Requester')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My Tickets/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create Ticket/i })).toBeInTheDocument();
    expect(screen.getByText('My Tickets Marker')).toBeInTheDocument();
  });

  it('shows the IT Staff role badge, Ticket Queue navigation, and no Requester links', async () => {
    renderShell({
      user: {
        id: 26,
        name: 'Michael Brown',
        email: 'michael.brown@toktickit.com',
        role: 'IT_STAFF',
        mustChangePassword: false,
      },
    });

    await waitFor(() => expect(screen.getByTestId('auth-user-name')).toHaveTextContent('Michael Brown'));
    expect(screen.getByText('IT Staff')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ticket Queue/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /My Tickets/i })).not.toBeInTheDocument();
  });

  it('Sign Out logs the user out and returns to /login', async () => {
    const fetchMock = renderShell(
      {
        user: {
          id: 1,
          name: 'Jennifer Anderson',
          email: 'jennifer.anderson@toktickit.com',
          role: 'REQUESTER',
          mustChangePassword: false,
        },
      },
      () => jsonResponse({ message: 'Successfully logged out' }),
    );

    await waitFor(() => expect(screen.getByTestId('auth-user-name')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Sign Out/i }));

    expect(await screen.findByText('Login Marker')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
