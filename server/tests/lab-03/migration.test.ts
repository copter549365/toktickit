/**
 * server/tests/lab-03/migration.test.ts
 *
 * Tests: MIGR-01, MIGR-02, DB-01
 * Verifies database state after Lab 3 migration and seed.
 *
 * Prerequisites (run before this suite):
 *   npx prisma migrate deploy    (or db push for dev)
 *   npx tsx prisma/seed.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const MIGRATION_SQL_PATH = path.join(
  projectRoot,
  'prisma/migrations/20260917000000_lab3_user_and_workflow/migration.sql',
);
const INITIAL_PASSWORD = 'InitialPassword123!';
const BCRYPT_HASH_RE = /'(\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53})'/g;

afterAll(async () => { await prisma.$disconnect(); });

// ---------------------------------------------------------------------------
// MIGR-01: Schema integrity & relationships
// ---------------------------------------------------------------------------
describe('MIGR-01: User model, relationships, and reference data', () => {
  it('should have at least 10 seeded User rows', async () => {
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it('should have the required roles present', async () => {
    const roles = await prisma.user.groupBy({ by: ['role'], _count: true });
    const roleNames = roles.map((r) => r.role);
    expect(roleNames).toContain('REQUESTER');
    expect(roleNames).toContain('IT_STAFF');
    expect(roleNames).toContain('ADMINISTRATOR');
  });

  it('should have at least 4 Categories', async () => {
    const count = await prisma.category.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('should have at least 6 Related Systems', async () => {
    const count = await prisma.relatedSystem.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it('every Ticket.requester should resolve to a User', async () => {
    const tickets = await prisma.ticket.findMany({
      include: { requester: true },
    });
    for (const t of tickets) {
      expect(t.requester).not.toBeNull();
      expect(t.requester.id).toBeGreaterThan(0);
    }
  });

  it('assigned tickets should resolve ticketOwner as a User', async () => {
    const assigned = await prisma.ticket.findMany({
      where:   { ticketOwnerId: { not: null } },
      include: { ticketOwner: true },
    });
    for (const t of assigned) {
      expect(t.ticketOwner).not.toBeNull();
    }
  });

  it('tickets should span multiple statuses including new Lab 3 statuses', async () => {
    const statuses = await prisma.ticket.groupBy({ by: ['currentStatus'], _count: true });
    const statusNames = statuses.map((s) => s.currentStatus as string);
    // At least some tickets in any status
    expect(statusNames.length).toBeGreaterThanOrEqual(3);
    // Verify new statuses are representable (enum constraint)
    const allStatuses = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'];
    for (const s of statusNames) {
      expect(allStatuses).toContain(s);
    }
  });

  it('should have PublicComment rows linked to tickets and users', async () => {
    const comments = await prisma.publicComment.findMany({
      include: { ticket: true, author: true },
    });
    expect(comments.length).toBeGreaterThanOrEqual(1);
    for (const c of comments) {
      expect(c.ticket).not.toBeNull();
      expect(c.author).not.toBeNull();
    }
  });

  it('should have InternalNote rows linked to tickets and users', async () => {
    const notes = await prisma.internalNote.findMany({
      include: { ticket: true, author: true },
    });
    expect(notes.length).toBeGreaterThanOrEqual(1);
    for (const n of notes) {
      expect(n.ticket).not.toBeNull();
      expect(n.author).not.toBeNull();
    }
  });

  // BR-11 / handout.md §4.5: IT Priority initially copies Requested Priority.
  // The migration backfills this for pre-existing (Lab 2) tickets — no
  // ticket should be left with a NULL itPriority after migration.
  it('no ticket should have a NULL itPriority after migration', async () => {
    const count = await prisma.ticket.count({ where: { itPriority: null } });
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MIGR-02: Password hash integrity & mustChangePassword flag
//
// Covers BOTH seeded users AND genuinely-migrated (Lab 2 RequesterUser →
// User) rows. The migration SQL is checked statically (so this passes
// deterministically in any environment, including a fresh DB with no
// legacy RequesterUser data) and, when migrated rows do exist locally,
// they are checked dynamically too — see docs/lab-03/specification.md §7.2.
// ---------------------------------------------------------------------------
describe('MIGR-02: Seeded and migrated users have valid bcrypt hashes and mustChangePassword=true', () => {
  let users: Awaited<ReturnType<typeof prisma.user.findMany>>;

  beforeAll(async () => {
    users = await prisma.user.findMany();
  });

  it('all users should have a non-empty passwordHash', () => {
    for (const u of users) {
      expect(u.passwordHash).toBeTruthy();
      expect(u.passwordHash.length).toBeGreaterThan(20);
    }
  });

  it('all seeded users should have mustChangePassword = true', () => {
    for (const u of users) {
      expect(u.mustChangePassword).toBe(true);
    }
  });

  it('known seeded user password should match InitialPassword123!', async () => {
    const jennifer = await prisma.user.findUnique({
      where: { email: 'jennifer.anderson@toktickit.com' },
    });
    expect(jennifer).not.toBeNull();
    const match = await bcrypt.compare(INITIAL_PASSWORD, jennifer!.passwordHash);
    expect(match).toBe(true);
  });

  it('no User row anywhere should carry the old placeholder migration hash', async () => {
    const placeholderRows = await prisma.user.findMany({
      where: { passwordHash: { contains: 'PLACEHOLDER_MIGRATE_HASH' } },
    });
    expect(placeholderRows).toHaveLength(0);
  });

  // Static check: reads the actual migration SQL and validates every bcrypt
  // hash literal in it. This is what actually catches a regression to a
  // fake/placeholder hash — independent of what happens to be migrated in
  // any particular database.
  it('the migration SQL embeds real, working bcrypt hashes (not a placeholder)', () => {
    const sql = fs.readFileSync(MIGRATION_SQL_PATH, 'utf-8');
    expect(sql).not.toContain('PLACEHOLDER');
    const hashes = [...sql.matchAll(BCRYPT_HASH_RE)].map((m) => m[1]);
    expect(hashes.length).toBeGreaterThan(0);
  });

  it('every bcrypt hash embedded in the migration SQL authenticates InitialPassword123!', async () => {
    const sql = fs.readFileSync(MIGRATION_SQL_PATH, 'utf-8');
    const hashes = [...sql.matchAll(BCRYPT_HASH_RE)].map((m) => m[1]);
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) {
      const ok = await bcrypt.compare(INITIAL_PASSWORD, hash);
      expect(ok).toBe(true);
    }
  });

  // Dynamic check: a Requester row that isn't one of the known Lab 3 seed
  // fixtures (@toktickit.com) is evidence of a genuinely Lab-2-migrated
  // account. Where such rows exist (e.g. a DB carrying real Lab 2 history),
  // verify they can actually authenticate with the documented initial
  // password — this is the exact gap flagged in PR #43 review comment 5.
  it('any genuinely-migrated (non-seed) Requester can authenticate with InitialPassword123!', async () => {
    const migrated = await prisma.user.findMany({
      where: {
        role: 'REQUESTER',
        mustChangePassword: true,
        email: { not: { endsWith: '@toktickit.com' } },
      },
    });
    if (migrated.length === 0) {
      // No legacy RequesterUser data in this database — nothing to check
      // dynamically. The static hash-validity tests above still cover
      // MIGR-02 for this environment.
      return;
    }
    for (const u of migrated) {
      const ok = await bcrypt.compare(INITIAL_PASSWORD, u.passwordHash);
      expect(ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// DB-01: Seed idempotency — running seed twice must not create duplicates
// ---------------------------------------------------------------------------
describe('DB-01: Seed idempotency', () => {
  it('running seed again should not change User count', async () => {
    const countBefore = await prisma.user.count();
    // Re-run seed programmatically by calling the upsert logic inline
    const { execSync } = await import('child_process');
    execSync('npx tsx prisma/seed.ts', { cwd: process.cwd() + '/..', stdio: 'ignore' });
    const countAfter = await prisma.user.count();
    expect(countAfter).toBe(countBefore);
  });

  it('running seed again should not change Category count', async () => {
    const countBefore = await prisma.category.count();
    const { execSync } = await import('child_process');
    execSync('npx tsx prisma/seed.ts', { cwd: process.cwd() + '/..', stdio: 'ignore' });
    const countAfter = await prisma.category.count();
    expect(countAfter).toBe(countBefore);
  });

  it('running seed again should not change Ticket count', async () => {
    const countBefore = await prisma.ticket.count();
    const { execSync } = await import('child_process');
    execSync('npx tsx prisma/seed.ts', { cwd: process.cwd() + '/..', stdio: 'ignore' });
    const countAfter = await prisma.ticket.count();
    expect(countAfter).toBe(countBefore);
  });

  // PR #43 review comment 2: PublicComment/InternalNote were being
  // duplicated on every seed run because they used .create() instead of an
  // idempotency guard. Assert their counts directly, not just the
  // FK-validity smoke check below (which would pass either way).
  it('running seed again should not change PublicComment count', async () => {
    const countBefore = await prisma.publicComment.count();
    const { execSync } = await import('child_process');
    execSync('npx tsx prisma/seed.ts', { cwd: process.cwd() + '/..', stdio: 'ignore' });
    const countAfter = await prisma.publicComment.count();
    expect(countAfter).toBe(countBefore);
  });

  it('running seed again should not change InternalNote count', async () => {
    const countBefore = await prisma.internalNote.count();
    const { execSync } = await import('child_process');
    execSync('npx tsx prisma/seed.ts', { cwd: process.cwd() + '/..', stdio: 'ignore' });
    const countAfter = await prisma.internalNote.count();
    expect(countAfter).toBe(countBefore);
  });

  it('all Ticket FKs should still be valid after second seed run', async () => {
    const tickets = await prisma.ticket.findMany({
      include: { requester: true, category: true, relatedSystem: true },
    });
    for (const t of tickets) {
      expect(t.requester).not.toBeNull();
      expect(t.category).not.toBeNull();
      expect(t.relatedSystem).not.toBeNull();
    }
  });
});
