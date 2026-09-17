import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequesterProvider } from '../../src/context/RequesterContext';
import { CreateTicket } from '../../src/screens/CreateTicket';

const mockCategories = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
];

const mockRelatedSystems = [
  { id: 1, name: 'Email' },
  { id: 2, name: 'Corporate Laptop' },
];

const mockRequester = {
  id: 1,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@example.com',
  isActive: true,
};

function renderCreateTicket() {
  sessionStorage.setItem('toktickit.actingRequester', JSON.stringify(mockRequester));

  return render(
    <MemoryRouter initialEntries={['/tickets/new']}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets" element={<div>My Tickets Screen</div>} />
          <Route path="/tickets/:id" element={<div>Ticket Detail Screen</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  );
}

describe('UI-02..UI-06: Create Ticket Screen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  function setupReferenceDataMock(postHandler?: (url: string, init?: RequestInit) => Promise<Response>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockCategories,
          } as Response);
        }
        if (url.includes('/api/related-systems')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockRelatedSystems,
          } as Response);
        }
        if (postHandler) {
          return postHandler(url, init);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        } as Response);
      }),
    );
  }

  it('UI-02: blocks submit and displays inline field errors for blank Summary / short Description', async () => {
    const postSpy = vi.fn();
    setupReferenceDataMock(postSpy);

    renderCreateTicket();

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    // Enter short summary and short description
    fireEvent.change(screen.getByLabelText(/Summary/i), { target: { value: 'abc' } }); // < 5 chars
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'short' } }); // < 10 chars

    fireEvent.click(screen.getByRole('button', { name: /Submit Ticket/i }));

    expect(await screen.findByText('Summary must be 5-120 characters.')).toBeInTheDocument();
    expect(screen.getByText('Description must be 10-2000 characters.')).toBeInTheDocument();

    // Ensure POST /api/tickets was NOT called
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('UI-03: attachment picker rejects oversized and unsupported files client-side without adding them', async () => {
    setupReferenceDataMock();
    renderCreateTicket();

    await waitFor(() => {
      expect(screen.getByLabelText(/Select file to attach/i)).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText(/Select file to attach/i);

    // 1. Test unsupported file type (.exe)
    const exeFile = new File(['fake exe binary'], 'virus.exe', { type: 'application/x-msdownload' });
    fireEvent.change(fileInput, { target: { files: [exeFile] } });

    expect(
      await screen.findByText(/File "virus.exe" has an unsupported file type/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('virus.exe')).not.toBeInTheDocument();
    expect(screen.getByText('0 / 5 attachments')).toBeInTheDocument();

    // 2. Test oversized file (> 5 MB)
    const largeContent = new Uint8Array(6 * 1024 * 1024);
    const largeFile = new File([largeContent], 'large_image.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    expect(
      await screen.findByText(/File "large_image.png" exceeds the 5 MB size limit/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('large_image.png')).not.toBeInTheDocument();
    expect(screen.getByText('0 / 5 attachments')).toBeInTheDocument();

    // 3. Test valid file adds successfully
    const validFile = new File(['valid png data'], 'valid_screenshot.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(await screen.findByText('valid_screenshot.png')).toBeInTheDocument();
    expect(screen.getByText('1 / 5 attachments')).toBeInTheDocument();
  });

  it('UI-04: Submit button shows busy state and is disabled while POST is in flight, preventing duplicate clicks', async () => {
    let resolvePost: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });

    const postSpy = vi.fn().mockImplementation(() => pendingPromise);
    setupReferenceDataMock(postSpy);

    renderCreateTicket();

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Summary/i), {
      target: { value: 'Laptop battery issue' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Battery drains completely in 30 minutes while using IDE.' },
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Ticket/i });
    fireEvent.click(submitBtn);

    // Button should now be busy and disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submitting…/i })).toBeDisabled();
    });

    // Attempt second click while in flight
    fireEvent.click(screen.getByRole('button', { name: /Submitting…/i }));
    expect(postSpy).toHaveBeenCalledTimes(1);

    // Resolve request
    resolvePost!({
      ok: true,
      json: async () => ({
        id: 101,
        ticketNumber: 'TKT-2026-000101',
        currentStatus: 'NEW',
      }),
    } as Response);

    await waitFor(() => {
      expect(screen.getByText('TKT-2026-000101')).toBeInTheDocument();
    });
  });

  it('UI-05: successful submission displays the backend-returned Ticket Number in the success panel', async () => {
    setupReferenceDataMock((url) => {
      if (url.includes('/api/tickets')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 105,
            ticketNumber: 'TKT-2026-000105',
            currentStatus: 'NEW',
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    renderCreateTicket();

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Summary/i), {
      target: { value: 'Software license expired' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'IntelliJ IDEA license expired today and needs renewal.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit Ticket/i }));

    expect(await screen.findByText('Ticket Created Successfully')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-number-display')).toHaveTextContent('TKT-2026-000105');
    expect(screen.getByRole('button', { name: /View Ticket/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Another Ticket/i })).toBeInTheDocument();
  });

  it('UI-06: preserves entered form values when ticket creation API fails', async () => {
    setupReferenceDataMock((url) => {
      if (url.includes('/api/tickets')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'INTERNAL_ERROR' }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    renderCreateTicket();

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    const typedSummary = 'Cannot access campus network shares';
    const typedDescription = 'Error 0x80070035 network path was not found when mounting \\\\fileserver.';

    fireEvent.change(screen.getByLabelText(/Summary/i), { target: { value: typedSummary } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: typedDescription } });

    fireEvent.click(screen.getByRole('button', { name: /Submit Ticket/i }));

    // Error banner is shown
    expect(
      await screen.findByText(/Unable to create ticket. Please check your connection and try again./i),
    ).toBeInTheDocument();

    // Form inputs must retain their previous typed values
    expect(screen.getByLabelText(/Summary/i)).toHaveValue(typedSummary);
    expect(screen.getByLabelText(/Description/i)).toHaveValue(typedDescription);
  });
});
