import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../../src/App';

describe('UI Tests for TokTickIT', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('UI-01: TokTickIT heading renders', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /TokTickIT IT Service Desk/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check System/i })).toBeInTheDocument();
  });

  it('UI-02: Success state shows System Status Online', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', service: 'TokTickIT API' }),
        } as Response);
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 1, name: 'Account and Access' },
            { id: 2, name: 'Hardware' },
            { id: 3, name: 'Software' },
            { id: 4, name: 'Network' },
          ],
        } as Response);
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Check System/i }));

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument();
    });
  });

  it('UI-03: API failure shows Offline + a useful error message', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Check System/i }));

    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
      expect(screen.getByText(/Unable to connect to TokTickIT API/i)).toBeInTheDocument();
    });
  });

  it('UI-04: Categories from the API render on success (not hard-coded)', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', service: 'TokTickIT API' }),
        } as Response);
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 1, name: 'Account and Access' },
            { id: 2, name: 'Hardware' },
            { id: 3, name: 'Software' },
            { id: 4, name: 'Network' },
          ],
        } as Response);
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Check System/i }));

    await waitFor(() => {
      expect(screen.getByText(/Supported Request Categories:/i)).toBeInTheDocument();
      expect(screen.getByText('Account and Access')).toBeInTheDocument();
      expect(screen.getByText('Hardware')).toBeInTheDocument();
      expect(screen.getByText('Software')).toBeInTheDocument();
      expect(screen.getByText('Network')).toBeInTheDocument();
    });
  });
});
