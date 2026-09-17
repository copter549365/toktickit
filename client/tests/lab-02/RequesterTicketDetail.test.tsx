import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequesterProvider } from '../../src/context/RequesterContext';
import { RequesterTicketDetail } from '../../src/screens/RequesterTicketDetail';

const mockRequester = {
  id: 1,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@example.com',
  isActive: true,
};

function makeTicketDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    ticketNumber: 'TKT-2026-000101',
    requesterId: 1,
    categoryId: 2,
    categoryName: 'Hardware',
    relatedSystemId: 5,
    relatedSystemName: 'Corporate Laptop',
    summary: 'Laptop battery drains quickly',
    description: 'The battery drains from 100% to 10% within an hour of unplugging.',
    requestedPriority: 'MEDIUM',
    itPriority: null,
    currentStatus: 'NEW',
    ticketOwnerId: null,
    createdAt: '2026-08-20T09:14:00.000Z',
    updatedAt: '2026-08-20T09:14:00.000Z',
    attachments: [],
    ...overrides,
  };
}

function renderTicketDetail() {
  sessionStorage.setItem('toktickit.actingRequester', JSON.stringify(mockRequester));

  return render(
    <MemoryRouter initialEntries={['/tickets/101']}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<RequesterTicketDetail />} />
          <Route path="/tickets" element={<div>My Tickets Screen</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  );
}

describe('UI-11: Requester Ticket Detail Screen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('AC-20: renders all ticket fields as read-only with correct values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeTicketDetail(),
      } as Response),
    );

    renderTicketDetail();

    expect(await screen.findByText('TKT-2026-000101')).toBeInTheDocument();

    expect(screen.getByLabelText('Category')).toHaveValue('Hardware');
    expect(screen.getByLabelText('Category')).toBeDisabled();
    expect(screen.getByLabelText('Related System')).toHaveValue('Corporate Laptop');
    expect(screen.getByLabelText('Related System')).toBeDisabled();
    expect(screen.getByLabelText('Requester')).toHaveValue('Jennifer Anderson');
    expect(screen.getByLabelText('Ticket Owner')).toHaveValue('Unassigned');

    expect(screen.getByText('Laptop battery drains quickly')).toBeInTheDocument();
    expect(
      screen.getByText('The battery drains from 100% to 10% within an hour of unplugging.'),
    ).toBeInTheDocument();

    // Requested Priority / Current Status render as badges, not editable controls.
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Not yet triaged')).toBeInTheDocument();
  });

  it('AC-21: lists active attachments with correct metadata and a working download action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeTicketDetail({
            attachments: [
              {
                id: 1,
                ticketId: 101,
                originalFileName: 'screenshot.png',
                mimeType: 'image/png',
                fileSizeBytes: 204800,
                isRemoved: false,
                uploadedAt: '2026-08-20T09:20:00.000Z',
              },
              {
                id: 2,
                ticketId: 101,
                originalFileName: 'invoice.pdf',
                mimeType: 'application/pdf',
                fileSizeBytes: 51200,
                isRemoved: false,
                uploadedAt: '2026-08-20T09:25:00.000Z',
              },
            ],
          }),
      } as Response),
    );

    renderTicketDetail();

    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeInTheDocument();
    });
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('200.0 KB')).toBeInTheDocument();
    expect(screen.getByText('50.0 KB')).toBeInTheDocument();
    expect(screen.getByText('2 / 5 attachments')).toBeInTheDocument();

    const downloadButtons = screen.getAllByRole('button', { name: 'Download' });
    expect(downloadButtons).toHaveLength(2);
    downloadButtons.forEach((btn) => expect(btn).toBeEnabled());
  });

  it("AC-03: a nonexistent/not-owned ticket shows a safe not-found state instead of leaking data", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'TICKET_NOT_FOUND' }),
      } as Response),
    );

    renderTicketDetail();

    expect(
      await screen.findByText(/This ticket could not be found, or you do not have access to it\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to My Tickets/i })).toBeInTheDocument();
  });
});
