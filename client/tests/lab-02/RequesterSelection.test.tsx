import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequesterProvider } from '../../src/context/RequesterContext';
import { RequireRequester } from '../../src/components/RequireRequester';
import { RequesterSelection } from '../../src/screens/RequesterSelection';

const activeRequesters = [
  { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@example.com' },
  { id: 2, name: 'Michael Chen', email: 'michael.chen@example.com' },
];

function mockFetchOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response),
  );
}

function mockFetchFailure() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response));
}

function renderSelectionScreen(initialEntries = ['/select-requester']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <RequesterProvider>
        <Routes>
          <Route path="/select-requester" element={<RequesterSelection />} />
          <Route path="/tickets" element={<div>My Tickets Marker</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  );
}

describe('UI-01: Development Requester Selection screen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('renders a loading state before the requesters request resolves', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    renderSelectionScreen();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Loading development requesters/i)).toBeInTheDocument();
  });

  it('renders the loaded state with a Requester dropdown, Continue disabled until a choice is made', async () => {
    mockFetchOk(activeRequesters);
    renderSelectionScreen();

    await waitFor(() => {
      expect(screen.getByLabelText(/Development Requester/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('option', { name: 'Jennifer Anderson' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Michael Chen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled();
  });

  it('AC-29: renders an empty state when no active requesters are seeded, Continue disabled', async () => {
    mockFetchOk([]);
    renderSelectionScreen();

    await waitFor(() => {
      expect(
        screen.getByText(/No active development requesters are available/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled();
  });

  it('AC-30: renders a safe failure state with Retry when the requesters API fails', async () => {
    mockFetchFailure();
    renderSelectionScreen();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();

    mockFetchOk(activeRequesters);
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Development Requester/i)).toBeInTheDocument();
    });
  });

  it('AC-01/AC-02 support: selecting a Requester and continuing stores the identity and routes to My Tickets', async () => {
    mockFetchOk(activeRequesters);
    renderSelectionScreen();

    await waitFor(() => {
      expect(screen.getByLabelText(/Development Requester/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Development Requester/i), {
      target: { value: '2' },
    });
    expect(screen.getByRole('button', { name: /Continue/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText('My Tickets Marker')).toBeInTheDocument();
    });
    expect(sessionStorage.getItem('toktickit.actingRequester')).toContain('Michael Chen');
  });

  it('Cancel clears the pending selection without storing a Requester', async () => {
    mockFetchOk(activeRequesters);
    renderSelectionScreen();

    await waitFor(() => {
      expect(screen.getByLabelText(/Development Requester/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Development Requester/i), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.getByLabelText(/Development Requester/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled();
  });
});

describe('AC-02: route guard redirects to Selection when no Requester is acting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('redirects a protected route to /select-requester when no Requester is stored', () => {
    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <RequesterProvider>
          <Routes>
            <Route path="/select-requester" element={<div>Selection Screen Marker</div>} />
            <Route element={<RequireRequester />}>
              <Route path="/tickets" element={<div>My Tickets Marker</div>} />
            </Route>
          </Routes>
        </RequesterProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Selection Screen Marker')).toBeInTheDocument();
    expect(screen.queryByText('My Tickets Marker')).not.toBeInTheDocument();
  });

  it('allows the protected route through once a Requester is stored in sessionStorage', () => {
    sessionStorage.setItem(
      'toktickit.actingRequester',
      JSON.stringify({ id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@example.com' }),
    );

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <RequesterProvider>
          <Routes>
            <Route path="/select-requester" element={<div>Selection Screen Marker</div>} />
            <Route element={<RequireRequester />}>
              <Route path="/tickets" element={<div>My Tickets Marker</div>} />
            </Route>
          </Routes>
        </RequesterProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('My Tickets Marker')).toBeInTheDocument();
  });
});
