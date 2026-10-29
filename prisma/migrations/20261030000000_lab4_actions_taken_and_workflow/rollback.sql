-- Lab 4 rollback (docs/lab-04/specification.md §7.5). Prisma never runs this file; apply it by hand
-- only after taking a backup (`npm run db:backup`):
--
--   docker compose exec -T db psql -U toktickit_user -d toktickit_db < prisma/migrations/20261030000000_lab4_actions_taken_and_workflow/rollback.sql
--   npx prisma migrate resolve --rolled-back 20261030000000_lab4_actions_taken_and_workflow
--
-- Removes every Lab 4 object and restores the Lab 3 schema. Lab 1–3 data is untouched. Actions Taken
-- and status history are lost, so restore from the backup instead if they must be kept. The
-- itPriority backfill is deliberately kept: it only applied Lab 3 BR-11 to old rows.

BEGIN;

DROP TABLE IF EXISTS "ActionTaken";
DROP TABLE IF EXISTS "TicketStatusChange";
DROP TYPE IF EXISTS "ActionTakenStatus";

DROP INDEX IF EXISTS "Ticket_currentStatus_ticketOwnerId_idx";
DROP INDEX IF EXISTS "Ticket_requesterId_updatedAt_idx";
DROP INDEX IF EXISTS "Ticket_itPriority_currentStatus_idx";

ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version",
DROP COLUMN IF EXISTS "resolvedAt";

COMMIT;
