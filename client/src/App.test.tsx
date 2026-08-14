import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

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

  it('UI-02: Check System updates status to Online when API health check succeeds', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', service: 'TokTickIT API' }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);
    const checkBtn = screen.getByRole('button', { name: /Check System/i });
    fireEvent.click(checkBtn);

    // Wait for the Online status badge
    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument();
    });
  });

  it('UI-03: API failure displays a useful error message and Offline status', async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);
    const checkBtn = screen.getByRole('button', { name: /Check System/i });
    fireEvent.click(checkBtn);

    // Wait for Offline status and error message
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
      expect(screen.getByText(/Unable to connect to TokTickIT API/i)).toBeInTheDocument();
    });
  });
});
