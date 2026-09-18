import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { Login } from '../../src/screens/Login';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<div>Change Password Marker</div>} />
          <Route path="/" element={<div>App Home Marker</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('UI-01: Login screen (AC-01)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the email and password fields with the Sign In action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, 401)));
    renderLogin();

    await waitFor(() => expect(screen.getByLabelText(/Email/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('renders required-field validation errors on empty submit without calling the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, 401));
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();

    await waitFor(() => expect(screen.getByLabelText(/Email/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(await screen.findByText(/Email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
    // Only the initial GET /api/auth/me call happened — no login attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows a busy spinner while the login request is in flight', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 401))
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();

    await waitFor(() => expect(screen.getByLabelText(/Email/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'jennifer.anderson@toktickit.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'InitialPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(await screen.findByRole('button', { name: /Signing in/i })).toBeDisabled();
  });

  it('renders a safe error message on invalid credentials (BR-01)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 401))
      .mockResolvedValueOnce(
        jsonResponse({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }, 401),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();

    await waitFor(() => expect(screen.getByLabelText(/Email/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'wrong@toktickit.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'WrongPass1!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid email or password/i);
  });

  it('renders a safe error message for a deactivated account (BR-01)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 401))
      .mockResolvedValueOnce(
        jsonResponse({ error: 'ACCOUNT_INACTIVE', message: 'This account has been deactivated.' }, 401),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();

    await waitFor(() => expect(screen.getByLabelText(/Email/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'robert.wilson@toktickit.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'InitialPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/deactivated/i);
  });

  it('AC-02: routes to the mandatory Change Password screen when mustChangePassword is true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            id: 1,
            name: 'Jennifer Anderson',
            email: 'jennifer.anderson@toktickit.com',
            role: 'REQUESTER',
            mustChangePassword: true,
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();

    await waitFor(() => expect(screen.getByLabelText(/Email/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'jennifer.anderson@toktickit.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'InitialPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(await screen.findByText('Change Password Marker')).toBeInTheDocument();
  });

  it('AC-01: routes into the application when mustChangePassword is false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            id: 1,
            name: 'Jennifer Anderson',
            email: 'jennifer.anderson@toktickit.com',
            role: 'REQUESTER',
            mustChangePassword: false,
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();

    await waitFor(() => expect(screen.getByLabelText(/Email/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'jennifer.anderson@toktickit.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'InitialPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(await screen.findByText('App Home Marker')).toBeInTheDocument();
  });
});
