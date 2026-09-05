import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttachmentSection } from '../../src/components/AttachmentSection';
import type { Attachment } from '../../src/types/attachment';

function activeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 1,
    ticketId: 101,
    originalFileName: 'screenshot.png',
    mimeType: 'image/png',
    fileSizeBytes: 204800,
    isRemoved: false,
    uploadedAt: '2026-08-20T09:20:00.000Z',
    ...overrides,
  };
}

function removedAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 2,
    ticketId: 101,
    originalFileName: 'old-invoice.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 51200,
    isRemoved: true,
    removedAt: '2026-08-21T10:00:00.000Z',
    removalReason: 'Wrong file attached by mistake',
    uploadedAt: '2026-08-20T09:25:00.000Z',
    ...overrides,
  };
}

describe('UI-12..UI-14: AttachmentSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('UI-12: adding a valid file to a ticket with <5 active attachments shows it as active immediately after success', async () => {
    const newAttachment = activeAttachment({ id: 3, originalFileName: 'new-photo.jpg', mimeType: 'image/jpeg' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => newAttachment,
      } as Response),
    );

    const onAttachmentAdded = vi.fn();

    render(
      <AttachmentSection
        requesterId={1}
        ticketId={101}
        attachments={[]}
        onAttachmentAdded={onAttachmentAdded}
        onAttachmentRemoved={vi.fn()}
      />,
    );

    const fileInput = screen.getByLabelText(/Add attachment/i);
    const file = new File(['fake jpg data'], 'new-photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(onAttachmentAdded).toHaveBeenCalledWith(newAttachment);
    });
  });

  it('UI-13: soft-remove flow requires a reason before Confirm is enabled, then calls DELETE with the reason', async () => {
    const attachment = activeAttachment();
    const updated = { ...attachment, isRemoved: true, removedAt: '2026-08-21T10:00:00.000Z', removalReason: 'No longer relevant' };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => updated,
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const onAttachmentRemoved = vi.fn();

    render(
      <AttachmentSection
        requesterId={1}
        ticketId={101}
        attachments={[attachment]}
        onAttachmentAdded={vi.fn()}
        onAttachmentRemoved={onAttachmentRemoved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const confirmButton = await screen.findByRole('button', { name: 'Confirm Removal' });
    expect(confirmButton).toBeDisabled();

    const reasonInput = screen.getByPlaceholderText(/Why is this attachment being removed/i);
    fireEvent.change(reasonInput, { target: { value: 'no' } }); // < 3 chars, still invalid
    expect(confirmButton).toBeDisabled();

    fireEvent.change(reasonInput, { target: { value: 'No longer relevant' } });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onAttachmentRemoved).toHaveBeenCalledWith(updated);
    });

    const [, requestInit] = fetchSpy.mock.calls[0];
    expect(requestInit.method).toBe('DELETE');
    expect(JSON.parse(requestInit.body)).toEqual({ removalReason: 'No longer relevant' });
  });

  it('UI-14: a removed attachment shows a disabled download control with an explanatory tooltip', () => {
    const removed = removedAttachment();

    render(
      <AttachmentSection
        requesterId={1}
        ticketId={101}
        attachments={[removed]}
        onAttachmentAdded={vi.fn()}
        onAttachmentRemoved={vi.fn()}
      />,
    );

    const row = screen.getByTestId('attachment-row-2');
    expect(within(row).getByText('old-invoice.pdf')).toBeInTheDocument();
    expect(within(row).getByText('Removed')).toBeInTheDocument();
    expect(within(row).getByText(/Wrong file attached by mistake/i)).toBeInTheDocument();

    const downloadButton = within(row).getByRole('button', { name: 'Download' });
    expect(downloadButton).toBeDisabled();
    expect(downloadButton).toHaveAttribute(
      'title',
      'This attachment was removed and can no longer be downloaded.',
    );
  });
});
