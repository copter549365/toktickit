import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { ChangePassword } from '../../src/screens/ChangePassword';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const AUTH_USER = {
  id: 1,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@toktickit.com',
  role: 'REQUESTER' as const,
  mustChangePassword: true,
};

function renderChangePassword(meResponse: unknown = { user: AUTH_USER }, fetchImpl?: () => Response) {
  const fetchMock = fetchImpl
    ? vi.fn(fetchImpl)
    : vi.fn().mockResolvedValue(jsonResponse(meResponse, meResponse === null ? 401 : 200));
  vi.stubGlobal('fetch', fetchMock);

  render(
    <MemoryRouter initialEntries={['/change-password']}>
      <AuthProvider>
        <Routes>
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/login" element={<div>Login Marker</div>} />
          <Route path="/" element={<div>App Home Marker</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

  return fetchMock;
}

describe('UI-02: Mandatory Change Password screen (AC-02, BR-02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('redirects to /login when there is no authenticated session', async () => {
    renderChangePassword(null);
    expect(await screen.findByText('Login Marker')).toBeInTheDocument();
  });

  it('redirects into the app when the user has already changed their password', async () => {
    renderChangePassword({ user: { ...AUTH_USER, mustChangePassword: false } });
    expect(await screen.findByText('App Home Marker')).toBeInTheDocument();
  });

  it('renders the live checklist marking rules as satisfied while typing', async () => {
    renderChangePassword();
    await waitFor(() => expect(screen.getByLabelText(/New password/i)).toBeInTheDocument());

    const newPasswordInput = screen.getByLabelText(/New password/i);

    fireEvent.change(newPasswordInput, { target: { value: 'short' } });
    expect(screen.getByText(/At least 8 characters/).closest('li')).not.toHaveClass('is-met');

    fireEvent.change(newPasswordInput, { target: { value: 'SecureNewPassword456!' } });
    expect(screen.getByText(/At least 8 characters/).closest('li')).toHaveClass('is-met');
    expect(screen.getByText(/Includes uppercase & lowercase letters/).closest('li')).toHaveClass('is-met');
    expect(
      screen.getByText(/Includes a number and a special character/).closest('li'),
    ).toHaveClass('is-met');
  });

  it('rejects a confirm password that does not match', async () => {
    renderChangePassword();
    await waitFor(() => expect(screen.getByLabelText(/Current \(temporary\) password/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Current \(temporary\) password/i), {
      target: { value: 'InitialPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/New password/i), {
      target: { value: 'SecureNewPassword456!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'DoesNotMatch789!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Update Password and Enter/i }));

    expect(await screen.findByText(/Passwords do not match/i)).toBeInTheDocument();
  });

  it('AC-02: on success, updates the session and enters the application', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ user: AUTH_USER }))
      .mockResolvedValueOnce(
        jsonResponse({
          message: 'Password successfully updated',
          user: { ...AUTH_USER, mustChangePassword: false },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <AuthProvider>
          <Routes>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<div>App Home Marker</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText(/Current \(temporary\) password/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Current \(temporary\) password/i), {
      target: { value: 'InitialPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/New password/i), {
      target: { value: 'SecureNewPassword456!' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'SecureNewPassword456!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Update Password and Enter/i }));

    expect(await screen.findByText('App Home Marker')).toBeInTheDocument();
  });
});
