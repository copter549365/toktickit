import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequesterProvider } from '../../src/context/RequesterContext';
import { CreateTicket } from '../../src/screens/CreateTicket';

const mockCategories = [{ id: 1, name: 'Account and Access' }];
const mockRelatedSystems = [{ id: 1, name: 'Email' }];
const mockRequester = {
  id: 1,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@example.com',
  isActive: true,
};

describe('STYLE-01: Form Accessibility and Zen Green Style Requirements', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    sessionStorage.setItem('toktickit.actingRequester', JSON.stringify(mockRequester));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
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
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }),
    );
  });

  it('renders required-field asterisks with aria-hidden="true" on all required form fields', async () => {
    render(
      <MemoryRouter initialEntries={['/tickets/new']}>
        <RequesterProvider>
          <Routes>
            <Route path="/tickets/new" element={<CreateTicket />} />
          </Routes>
        </RequesterProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    const asterisks = document.querySelectorAll('.zg-required-marker');
    expect(asterisks.length).toBeGreaterThanOrEqual(4); // Category, Related System, Priority, Summary, Description

    asterisks.forEach((el) => {
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el).toHaveTextContent('*');
    });
  });

  it('renders validation error messages with role="alert" and aria-describedby linkage when invalid', async () => {
    render(
      <MemoryRouter initialEntries={['/tickets/new']}>
        <RequesterProvider>
          <Routes>
            <Route path="/tickets/new" element={<CreateTicket />} />
          </Routes>
        </RequesterProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Summary/i)).toBeInTheDocument();
    });

    // Clear summary and enter short description
    fireEvent.change(screen.getByLabelText(/Summary/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: /Submit Ticket/i }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(2);

    const summaryInput = screen.getByLabelText(/Summary/i);
    expect(summaryInput).toHaveAttribute('aria-invalid', 'true');
    expect(summaryInput).toHaveAttribute('aria-describedby', 'summary-input-error');

    const descTextarea = screen.getByLabelText(/Description/i);
    expect(descTextarea).toHaveAttribute('aria-invalid', 'true');
    expect(descTextarea).toHaveAttribute('aria-describedby', 'description-textarea-error');
  });

  it('read-only system fields have proper aria-readonly attributes and distinct styling class', async () => {
    render(
      <MemoryRouter initialEntries={['/tickets/new']}>
        <RequesterProvider>
          <Routes>
            <Route path="/tickets/new" element={<CreateTicket />} />
          </Routes>
        </RequesterProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Requester/i)).toBeInTheDocument();
    });

    const ticketNumberField = screen.getByLabelText(/Ticket Number/i);
    expect(ticketNumberField).toHaveClass('field-readonly');
    expect(ticketNumberField).toHaveAttribute('aria-readonly', 'true');

    const requesterField = screen.getByLabelText(/Requester/i);
    expect(requesterField).toHaveClass('field-readonly');
    expect(requesterField).toHaveAttribute('aria-readonly', 'true');
    expect(requesterField).toHaveValue('Jennifer Anderson');
  });
});
