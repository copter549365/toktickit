export interface Attachment {
  id: number;
  ticketId: number;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  isRemoved: boolean;
  removedAt?: string | null;
  removalReason?: string | null;
  uploadedAt: string;
}
