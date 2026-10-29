/**
 * server/tests/lab-04/migration.test.ts
 *
 * Tests: MIG-L4-01 (AC-27, spec §7.3), MIG-L4-02 (spec §7.5)
 *
 * Runs in its own scratch database so it can start from a true Lab 3 schema with legacy rows,
 * independent of the shared development database the other suites use:
 *   1. CREATE DATABASE <scratch>, then apply every migration *before* the Lab 4 one.
 *   2. Insert legacy Lab 3 data (Users, Tickets incl. NULL itPriority / RESOLVED / CLOSED,
 *      Attachments, Public Comments, Internal Notes) and snapshot row counts.
 *   3. Apply the Lab 4 migration → data preserved and backfilled (MIG-L4-01).
 *   4. Apply rollback.sql → Lab 4 objects gone, Lab 3 data intact; re-apply → clean (MIG-L4-02).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const MIGRATIONS_DIR = path.join(projectRoot, 'prisma/migrations');
const LAB4_MIGRATION = '20261030000000_lab4_actions_taken_and_workflow';
const LAB4_DIR = path.join(MIGRATIONS_DIR, LAB4_MIGRATION);

const baseUrl = new URL(
  process.env.DATABASE_URL ||
    'postgresql://toktickit_user:toktickit_password@localhost:5432/toktickit_db?schema=public',
);
const SCRATCH_DB = `toktickit_mig_l4_${process.pid}`;
const scratchUrl = new URL(baseUrl.toString());
scratchUrl.pathname = `/${SCRATCH_DB}`;
scratchUrl.search = '';

let admin: pg.Client;
let db: pg.Client;

const LEGACY_TABLES = ['User', 'Ticket', 'Attachment', 'PublicComment', 'InternalNote'] as const;

async function counts(client: pg.Client): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of LEGACY_TABLES) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
    result[table] = rows[0].n;
  }
  return result;
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
  const { rows } = await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public."${table}"`]);
  return rows[0].ok;
}

async function columnExists(client: pg.Client, table: string, column: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows.length > 0;
}

function readSql(file: string): string {
  return fs.readFileSync(file, 'utf-8');
}

let before: Record<string, number>;

beforeAll(async () => {
  const adminUrl = new URL(baseUrl.toString());
  adminUrl.search = '';
  admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${SCRATCH_DB}"`);
  await admin.query(`CREATE DATABASE "${SCRATCH_DB}"`);

  db = new pg.Client({ connectionString: scratchUrl.toString() });
  await db.connect();

  // 1. Every migration before Lab 4, in the same order Prisma applies them.
  const earlier = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name < LAB4_MIGRATION)
    .map((d) => d.name)
    .sort();
  for (const name of earlier) {
    await db.query(readSql(path.join(MIGRATIONS_DIR, name, 'migration.sql')));
  }

  // 2. Legacy Lab 3 rows.
  await db.query(`
    INSERT INTO "Category" (id, name) VALUES (1, 'Hardware');
    INSERT INTO "RelatedSystem" (id, name) VALUES (1, 'Corporate Laptop');
    INSERT INTO "User" (id, name, email, "passwordHash", role, "updatedAt") VALUES
      (1, 'Legacy Requester', 'legacy.requester@example.com', 'x', 'REQUESTER', now()),
      (2, 'Legacy Staff', 'legacy.staff@example.com', 'x', 'IT_STAFF', now());
    INSERT INTO "Ticket" (id, "ticketNumber", "requesterId", "categoryId", "relatedSystemId", summary, description,
                          "requestedPriority", "itPriority", "currentStatus", "ticketOwnerId", "createdAt", "updatedAt") VALUES
      (1, 'TKT-2026-000001', 1, 1, 1, 'In progress, no IT priority', 'd', 'HIGH', NULL, 'IN_PROGRESS', 2,
          '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
      (2, 'TKT-2026-000002', 1, 1, 1, 'Resolved legacy', 'd', 'LOW', 'LOW', 'RESOLVED', 2,
          '2026-09-03T00:00:00Z', '2026-09-04T05:06:07Z'),
      (3, 'TKT-2026-000003', 1, 1, 1, 'Closed legacy', 'd', 'MEDIUM', 'HIGH', 'CLOSED', 2,
          '2026-09-05T00:00:00Z', '2026-09-06T00:00:00Z'),
      (4, 'TKT-2026-000004', 1, 1, 1, 'New unassigned', 'd', 'MEDIUM', 'MEDIUM', 'NEW', NULL,
          '2026-09-07T00:00:00Z', '2026-09-07T00:00:00Z');
    INSERT INTO "Attachment" ("ticketId", "originalFileName", "storedFileName", "mimeType", "fileSizeBytes")
      VALUES (1, 'a.png', 's-a.png', 'image/png', 10), (2, 'b.pdf', 's-b.pdf', 'application/pdf', 20);
    INSERT INTO "PublicComment" ("ticketId", "authorId", content) VALUES (1, 1, 'hi'), (1, 2, 'hello');
    INSERT INTO "InternalNote" ("ticketId", "authorId", content) VALUES (2, 2, 'private');
  `);
  before = await counts(db);
}, 60_000);

afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS "${SCRATCH_DB}"`);
    await admin.end();
  }
});

// ---------------------------------------------------------------------------
// MIG-L4-01: Lab 4 migration preserves and backfills legacy data
// ---------------------------------------------------------------------------
describe('MIG-L4-01: Lab 4 migration on a Lab 3 database', () => {
  beforeAll(async () => {
    await db.query(readSql(path.join(LAB4_DIR, 'migration.sql')));
  });

  it('keeps every pre-existing User, Ticket, Attachment, PublicComment and InternalNote row', async () => {
    expect(await counts(db)).toEqual(before);
  });

  it('creates the ActionTaken and TicketStatusChange tables', async () => {
    expect(await tableExists(db, 'ActionTaken')).toBe(true);
    expect(await tableExists(db, 'TicketStatusChange')).toBe(true);
  });

  it('gives every legacy ticket version 1 and zero Actions Taken (spec §7.4)', async () => {
    const { rows } = await db.query(`
      SELECT t.id, t.version, COUNT(a.id)::int AS actions
      FROM "Ticket" t LEFT JOIN "ActionTaken" a ON a."ticketId" = t.id
      GROUP BY t.id ORDER BY t.id`);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.version).toBe(1);
      expect(r.actions).toBe(0);
    }
  });

  it('writes exactly one migrated history row per legacy ticket, holding its current status', async () => {
    const { rows } = await db.query(`
      SELECT t.id, t."currentStatus", t."updatedAt", h."fromStatus", h."toStatus", h."changedById",
             h."isMigrated", h."createdAt", h.note
      FROM "Ticket" t JOIN "TicketStatusChange" h ON h."ticketId" = t.id ORDER BY t.id`);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.fromStatus).toBeNull();
      expect(r.toStatus).toBe(r.currentStatus);
      expect(r.changedById).toBeNull();
      expect(r.isMigrated).toBe(true);
      expect(r.note).toBe('Status at Lab 4 migration');
      expect(new Date(r.createdAt).getTime()).toBe(new Date(r.updatedAt).getTime());
    }
  });

  it('backfills itPriority from requestedPriority where it was NULL, leaving set values alone', async () => {
    const { rows } = await db.query(`SELECT id, "itPriority" FROM "Ticket" ORDER BY id`);
    expect(rows.map((r) => r.itPriority)).toEqual(['HIGH', 'LOW', 'HIGH', 'MEDIUM']);
  });

  it('backfills resolvedAt = updatedAt only for RESOLVED and CLOSED tickets (BR-27)', async () => {
    const { rows } = await db.query(`SELECT id, "currentStatus", "updatedAt", "resolvedAt" FROM "Ticket" ORDER BY id`);
    for (const r of rows) {
      if (r.currentStatus === 'RESOLVED' || r.currentStatus === 'CLOSED') {
        expect(new Date(r.resolvedAt).getTime()).toBe(new Date(r.updatedAt).getTime());
      } else {
        expect(r.resolvedAt).toBeNull();
      }
    }
  });

  it('enforces one clientRequestId per ticket (BR-20) and new actions default to PLANNED, version 1', async () => {
    const insert = `
      INSERT INTO "ActionTaken" ("ticketId", "clientRequestId", "actionAt", description, "assigneeId",
                                 "createdById", "lastUpdatedById", "updatedAt")
      VALUES (1, '6f1c2b0e-8a4d-4b7e-9d1a-2f5e3c7b9a10', now(), 'Swapped battery', 2, 2, 2, now())
      RETURNING status, version, "followUpRequired"`;
    const { rows } = await db.query(insert);
    expect(rows[0]).toEqual({ status: 'PLANNED', version: 1, followUpRequired: false });
    await expect(db.query(insert)).rejects.toThrow(/unique/i);
    await db.query(`DELETE FROM "ActionTaken"`);
  });
});

// ---------------------------------------------------------------------------
// MIG-L4-02: rollback.sql restores the Lab 3 schema; the migration re-applies cleanly
// ---------------------------------------------------------------------------
describe('MIG-L4-02: rollback and recovery', () => {
  it('rollback.sql removes every Lab 4 object and keeps the Lab 3 data', async () => {
    await db.query(readSql(path.join(LAB4_DIR, 'rollback.sql')));

    expect(await tableExists(db, 'ActionTaken')).toBe(false);
    expect(await tableExists(db, 'TicketStatusChange')).toBe(false);
    expect(await columnExists(db, 'Ticket', 'version')).toBe(false);
    expect(await columnExists(db, 'Ticket', 'resolvedAt')).toBe(false);
    const { rows } = await db.query(`SELECT 1 FROM pg_type WHERE typname = 'ActionTakenStatus'`);
    expect(rows).toHaveLength(0);

    expect(await counts(db)).toEqual(before);
  });

  it('the Lab 4 migration re-applies cleanly after a rollback', async () => {
    await db.query(readSql(path.join(LAB4_DIR, 'migration.sql')));
    expect(await tableExists(db, 'ActionTaken')).toBe(true);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM "TicketStatusChange"`);
    expect(rows[0].n).toBe(4);
    expect(await counts(db)).toEqual(before);
  });
});
