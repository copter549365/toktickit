export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_ATTACHMENT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Client-side mirror of the server's type/size checks (BR-19, BR-20). Returns an error message
 * for the first failed rule, or `null` when the file is permitted. Shared by the Create Ticket
 * attachment picker and the Ticket Detail "Add Attachment" control (ui-spec.md §4.5).
 */
export function validateAttachmentFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const isValidExt = ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext);
  const isValidMime = !file.type || ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type.toLowerCase());

  if (!isValidExt || !isValidMime) {
    return `File "${file.name}" has an unsupported file type. Allowed: JPG, PNG, WEBP, PDF.`;
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `File "${file.name}" exceeds the 5 MB size limit (${formatBytes(file.size)}).`;
  }

  return null;
}
