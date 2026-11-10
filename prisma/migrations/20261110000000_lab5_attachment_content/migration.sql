-- Lab 5 (Issue 2, R-04): store uploaded attachment bytes in the database instead of the
-- container disk, so files survive a Cloud Run restart and redeploy. Additive only: a new
-- table, no change to existing columns or rows, so an older image still works after a rollback.
-- Attachments uploaded before this migration keep their bytes on local disk (dev only).

-- CreateTable
CREATE TABLE "AttachmentContent" (
    "attachmentId" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "AttachmentContent_pkey" PRIMARY KEY ("attachmentId")
);

-- AddForeignKey
ALTER TABLE "AttachmentContent" ADD CONSTRAINT "AttachmentContent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

