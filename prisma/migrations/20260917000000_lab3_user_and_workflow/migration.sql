-- ============================================================================
-- Lab 3 Migration: User model, 8-status workflow, PublicComment, InternalNote
-- Safe to run on a database that already has the Lab 2 tables.
-- ============================================================================

-- 1. Create UserRole enum
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Expand TicketStatus enum with the three new values
--    (PostgreSQL requires adding enum values one at a time)
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_REQUESTER' AFTER 'IN_PROGRESS';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'REOPENED' AFTER 'RESOLVED';

-- 3. Create the unified User table
CREATE TABLE IF NOT EXISTS "User" (
    "id"                 SERIAL       NOT NULL,
    "name"               TEXT         NOT NULL,
    "email"              TEXT         NOT NULL,
    "passwordHash"       TEXT         NOT NULL,
    "role"               "UserRole"   NOT NULL,
    "isActive"           BOOLEAN      NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- 4. Unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- 5. Supporting indexes
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_role_idx"  ON "User"("role");

-- 6. Migrate existing RequesterUser rows into User (idempotent via ON CONFLICT DO NOTHING)
--    Historical requesters get a placeholder hash and mustChangePassword = true so they
--    are forced to set a real password on first Lab 3 login.
INSERT INTO "User" ("name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "createdAt", "updatedAt")
SELECT
    ru."name",
    ru."email",
    -- Placeholder hash — seed.ts will overwrite real accounts;
    -- any row not overwritten will be forced to reset on login.
    '$2b$12$PLACEHOLDER_MIGRATE_HASH_CHANGEME_XXXXXXXXXXXXXXXXX',
    'REQUESTER'::"UserRole",
    ru."isActive",
    true,
    ru."createdAt",
    CURRENT_TIMESTAMP
FROM "RequesterUser" ru
ON CONFLICT ("email") DO NOTHING;

-- 7. Re-point Ticket.requesterId FK from RequesterUser → User
--    Step A: drop old FK constraint (if it exists — guard for idempotency)
DO $$ BEGIN
  ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_requesterId_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Step B: ensure Ticket.requesterId values have a matching User row
--         (handles edge cases where RequesterUser had rows not yet migrated)
INSERT INTO "User" ("name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "createdAt", "updatedAt")
SELECT DISTINCT
    ru."name",
    ru."email",
    '$2b$12$PLACEHOLDER_MIGRATE_HASH_CHANGEME_XXXXXXXXXXXXXXXXX',
    'REQUESTER'::"UserRole",
    ru."isActive",
    true,
    ru."createdAt",
    CURRENT_TIMESTAMP
FROM "RequesterUser" ru
JOIN "Ticket" t ON t."requesterId" = ru."id"
ON CONFLICT ("email") DO NOTHING;

-- Step C: update Ticket.requesterId to match User.id (joined via email)
UPDATE "Ticket" t
SET "requesterId" = u."id"
FROM "RequesterUser" ru
JOIN "User" u ON u."email" = ru."email"
WHERE t."requesterId" = ru."id"
  AND t."requesterId" != u."id";

-- Step D: add new FK pointing to User
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Add ticketOwner FK (Lab 2 had the column but no FK)
DO $$ BEGIN
  ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketOwnerId_fkey"
      FOREIGN KEY ("ticketOwnerId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. Add requesterResolvedIndicator column
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "requesterResolvedIndicator" BOOLEAN NOT NULL DEFAULT false;

-- 10. Add new indexes on Ticket
CREATE INDEX IF NOT EXISTS "Ticket_ticketOwnerId_idx" ON "Ticket"("ticketOwnerId");
CREATE INDEX IF NOT EXISTS "Ticket_currentStatus_idx" ON "Ticket"("currentStatus");

-- 11. Create PublicComment table
CREATE TABLE IF NOT EXISTS "PublicComment" (
    "id"        SERIAL       NOT NULL,
    "ticketId"  INTEGER      NOT NULL,
    "authorId"  INTEGER      NOT NULL,
    "content"   TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PublicComment_ticketId_idx" ON "PublicComment"("ticketId");
CREATE INDEX IF NOT EXISTS "PublicComment_authorId_idx" ON "PublicComment"("authorId");

ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$ BEGIN
  ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 12. Create InternalNote table
CREATE TABLE IF NOT EXISTS "InternalNote" (
    "id"        SERIAL       NOT NULL,
    "ticketId"  INTEGER      NOT NULL,
    "authorId"  INTEGER      NOT NULL,
    "content"   TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InternalNote_ticketId_idx" ON "InternalNote"("ticketId");
CREATE INDEX IF NOT EXISTS "InternalNote_authorId_idx" ON "InternalNote"("authorId");

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$ BEGIN
  ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
