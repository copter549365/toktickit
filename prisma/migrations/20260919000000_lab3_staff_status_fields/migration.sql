-- Lab 3 Issue 6: captures the resolution/reopen notes PATCH /api/staff/tickets/:id/status
-- persists per the State Transition Matrix (BR-13, docs/lab-03/api-spec.md §4).
ALTER TABLE "Ticket" ADD COLUMN "resolutionSummary" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "reopenReason" TEXT;
