import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

export const UPLOADS_DIRECTORY = path.resolve(process.cwd(), 'uploads');

export function ensureUploadsDirectory(): void {
  if (!fs.existsSync(UPLOADS_DIRECTORY)) {
    fs.mkdirSync(UPLOADS_DIRECTORY, { recursive: true });
  }
}

export function isValidExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

export function isValidMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

export function generateStoredFileName(originalFileName: string): string {
  const ext = path.extname(originalFileName).toLowerCase();
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
}

export function getAttachmentFilePath(storedFileName: string): string {
  return path.join(UPLOADS_DIRECTORY, storedFileName);
}
