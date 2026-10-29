-- Lab 4 Issue 2: Actions Taken, status history, optimistic concurrency, dashboard indexes
-- (docs/lab-04/specification.md §7.1–§7.3). Additive only: no existing column or table is dropped
-- or renamed. Undo with rollback.sql in this folder (§7.5).

-- CreateEnum
CREATE TYPE "ActionTakenStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable: optimistic concurrency (BR-18) and "Recently Resolved" (BR-15, BR-22)
ALTER TABLE "Ticket" ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "result" VARCHAR(2000),
    "status" "ActionTakenStatus" NOT NULL DEFAULT 'PLANNED',
    "assigneeId" INTEGER NOT NULL,
    "performedById" INTEGER,
    "createdById" INTEGER NOT NULL,
    "lastUpdatedById" INTEGER NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" VARCHAR(1000),
    "attachmentNotes" VARCHAR(1000),
    "cancelReason" VARCHAR(500),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatusChange" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus" NOT NULL,
    "changedById" INTEGER,
    "note" VARCHAR(2000),
    "isMigrated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");

-- CreateIndex
CREATE INDEX "ActionTaken_assigneeId_status_idx" ON "ActionTaken"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTaken_ticketId_clientRequestId_key" ON "ActionTaken"("ticketId", "clientRequestId");

-- CreateIndex
CREATE INDEX "TicketStatusChange_ticketId_createdAt_id_idx" ON "TicketStatusChange"("ticketId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Ticket_currentStatus_ticketOwnerId_idx" ON "Ticket"("currentStatus", "ticketOwnerId");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_updatedAt_idx" ON "Ticket"("requesterId", "updatedAt");

-- CreateIndex
CREATE INDEX "Ticket_itPriority_currentStatus_idx" ON "Ticket"("itPriority", "currentStatus");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill (spec §7.3, §7.4, BR-27). Legacy tickets keep version 1 (column default) and get no
-- Actions Taken.
-- ---------------------------------------------------------------------------

-- Lab 3 BR-11: IT Priority starts equal to Requested Priority. Lab 2-era rows may still be NULL.
UPDATE "Ticket" SET "itPriority" = "requestedPriority" WHERE "itPriority" IS NULL;

-- Legacy RESOLVED/CLOSED tickets: best available resolution time is their last update.
UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "currentStatus" IN ('RESOLVED', 'CLOSED');

-- One snapshot history row per legacy ticket, so every ticket has a non-empty history (BR-17).
INSERT INTO "TicketStatusChange" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "isMigrated", "createdAt")
SELECT "id", NULL, "currentStatus", NULL, 'Status at Lab 4 migration', true, "updatedAt"
FROM "Ticket";
