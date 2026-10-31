/**
 * client/tests/lab-04/FeedbackStates.test.tsx
 *
 * Tests: UI-L4-12 (docs/lab-04/tests.md §2.6; FR-19, ui-spec §8, spec D-19). One forbidden state
 * and one not-found state across the product: role-gated routes, both Ticket detail screens, and
 * the dashboards show the same wording and a way out. Safe failures never show raw error text.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { RequireAuth } from '../../src/components/RequireAuth';
import { RequireRole } from '../../src/components/RequireRole';
import { ErrorState } from '../../src/components/ErrorState';
import { RequesterTicketDetail } from '../../src/screens/RequesterTicketDetail';
import { StaffTicketDetail } from '../../src/screens/StaffTicketDetail';

const FORBIDDEN = "You don't have access to this page.";
const NOT_FOUND = "This ticket doesn't exist or you can't view it.";

const users = {
  REQUESTER: { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com', role: 'REQUESTER', mustChangePassword: false },
  IT_STAFF: { id: 5, name: 'Michael Brown', email: 'michael.brown@toktickit.com', role: 'IT_STAFF', mustChangePassword: false },
};

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function stub(role: keyof typeof users, ticketStatus = 404) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/me')) return jsonResponse({ user: users[role] });
      if (url.match(/\/api\/(staff\/)?tickets\/\d+$/)) {
        return jsonResponse({ error: ticketStatus === 404 ? 'TICKET_NOT_FOUND' : 'INTERNAL_ERROR', stack: 'at app.ts:1' }, ticketStatus);
      }
      return jsonResponse([]);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UI-L4-12: consistent forbidden, not-found, and failure states (FR-19, ui-spec §8)', () => {
  it('a role-gated route shows the shared forbidden state with a link to the Dashboard', async () => {
    stub('REQUESTER');
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AuthProvider>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route element={<RequireRole roles={['ADMINISTRATOR']} />}>
                <Route path="/admin/users" element={<div>User Management Marker</div>} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(FORBIDDEN)).toBeInTheDocument();
    expect(screen.getByTestId('forbidden-state')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByText('User Management Marker')).not.toBeInTheDocument();
  });

  it('the Requester Ticket detail shows the shared not-found state and a way back', async () => {
    stub('REQUESTER');
    render(
      <MemoryRouter initialEntries={['/tickets/999']}>
        <AuthProvider>
          <Routes>
            <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument();
    expect(screen.getByTestId('not-found-state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to My Tickets' })).toBeInTheDocument();
  });

  it('the Staff Ticket detail shows the same not-found state', async () => {
    stub('IT_STAFF');
    render(
      <MemoryRouter initialEntries={['/staff/tickets/999']}>
        <AuthProvider>
          <Routes>
            <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Queue' })).toBeInTheDocument();
  });

  it('a 500 on a Ticket detail shows the safe failure with Retry and no raw error text', async () => {
    stub('IT_STAFF', 500);
    render(
      <MemoryRouter initialEntries={['/staff/tickets/999']}>
        <AuthProvider>
          <Routes>
            <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText(/app\.ts|INTERNAL_ERROR/)).not.toBeInTheDocument();
  });

  it('ErrorState variants: forbidden and notFound are panels; failure is a retryable banner', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ErrorState variant="forbidden" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(FORBIDDEN);
    rerender(
      <MemoryRouter>
        <ErrorState variant="notFound" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(NOT_FOUND);
    rerender(
      <MemoryRouter>
        <ErrorState onRetry={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
