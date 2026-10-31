-- Lab 4 rollback (docs/lab-04/specification.md §7.5). Prisma never runs this file; apply it by hand
-- only after taking a backup (`npm run db:backup`):
--
--   docker compose exec -T db psql -U toktickit_user -d toktickit_db < prisma/migrations/20261030000000_lab4_actions_taken_and_workflow/rollback.sql
--
-- Removes every Lab 4 object and restores the Lab 3 schema. Lab 1–3 data is untouched. Actions Taken
-- and status history are lost, so restore from the backup instead if they must be kept. The
-- itPriority backfill and the cleared requesterResolvedIndicator are deliberately kept: both only
-- bring old rows in line with the business rules.
--
-- It also deletes the migration's _prisma_migrations row, so `prisma migrate status` shows it as
-- pending and `prisma migrate deploy` re-applies it. Do not use `prisma migrate resolve
-- --rolled-back` instead: it only accepts failed migrations and stops with P3012.

BEGIN;

DROP TABLE IF EXISTS "ActionTaken";
DROP TABLE IF EXISTS "TicketStatusChange";
DROP TYPE IF EXISTS "ActionTakenStatus";

DROP INDEX IF EXISTS "Ticket_currentStatus_ticketOwnerId_idx";
DROP INDEX IF EXISTS "Ticket_requesterId_updatedAt_idx";
DROP INDEX IF EXISTS "Ticket_itPriority_currentStatus_idx";

ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version",
DROP COLUMN IF EXISTS "resolvedAt";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261030000000_lab4_actions_taken_and_workflow';

COMMIT;
