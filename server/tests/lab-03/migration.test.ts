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
import { prisma } from '../../src/db.js';

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
});

// ---------------------------------------------------------------------------
// MIGR-02: Password hash integrity & mustChangePassword flag
// ---------------------------------------------------------------------------
describe('MIGR-02: Seeded users have valid bcrypt hashes and mustChangePassword=true', () => {
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
    const match = await bcrypt.compare('InitialPassword123!', jennifer!.passwordHash);
    expect(match).toBe(true);
  });

  it('passwordHash should not be the placeholder migration hash', async () => {
    const jennifer = await prisma.user.findUnique({
      where: { email: 'jennifer.anderson@toktickit.com' },
    });
    expect(jennifer!.passwordHash).not.toContain('PLACEHOLDER_MIGRATE_HASH');
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
