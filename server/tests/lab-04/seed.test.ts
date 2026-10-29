/**
 * server/tests/lab-04/seed.test.ts
 *
 * Test: MIG-L4-03 (AC-27, spec §7.6)
 * The Lab 4 seed is idempotent and leaves data that demonstrates every Actions Taken shape and
 * both zero and non-zero dashboard metrics.
 *
 * Runs against the shared development database after `prisma migrate deploy`. It re-runs
 * prisma/seed.ts itself, so it never depends on another suite having seeded first.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const runSeed = () => execSync('npx tsx prisma/seed.ts', { cwd: projectRoot, stdio: 'ignore' });

const ACTIVE_STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const;

// Every ticket prisma/seed.ts owns: the 8 Lab 3 fixtures plus the Lab 4 additions (found by summary).
const LAB4_SEED_SUMMARIES = [
  'Request to cancel duplicate monitor order',
  'Outlook freezes when opening shared calendar',
  'Projector in Lecture Hall 3 shows no signal',
  'Need access to the department shared drive',
];

async function seededTickets() {
  return prisma.ticket.findMany({
    where: {
      OR: [
        { ticketNumber: { in: Array.from({ length: 8 }, (_, i) => `TKT-2026-00000${i + 1}`) } },
        { summary: { in: LAB4_SEED_SUMMARIES } },
      ],
    },
    include: { actionsTaken: true },
  });
}

async function userId(email: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return user.id;
}

beforeAll(() => {
  runSeed();
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('MIG-L4-03: seed idempotency', () => {
  it('a second run creates no Users, Tickets, Actions Taken or status-history rows', async () => {
    const snapshot = async () => ({
      users: await prisma.user.count(),
      tickets: await prisma.ticket.count(),
      actions: await prisma.actionTaken.count(),
      history: await prisma.ticketStatusChange.count(),
      comments: await prisma.publicComment.count(),
      notes: await prisma.internalNote.count(),
    });
    const before = await snapshot();
    runSeed();
    expect(await snapshot()).toEqual(before);
  }, 120_000);
});

describe('MIG-L4-03: seed coverage', () => {
  it('seeds all 8 statuses, all 3 IT priorities, and both assigned and unassigned tickets', async () => {
    const tickets = await seededTickets();
    expect(tickets).toHaveLength(8 + LAB4_SEED_SUMMARIES.length);
    expect(new Set(tickets.map((t) => t.currentStatus))).toEqual(
      new Set(['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']),
    );
    expect(new Set(tickets.map((t) => t.itPriority))).toEqual(new Set(['LOW', 'MEDIUM', 'HIGH']));
    expect(tickets.some((t) => t.ticketOwnerId === null)).toBe(true);
    expect(tickets.some((t) => t.ticketOwnerId !== null)).toBe(true);
  });

  it('seeds tickets with zero, exactly one, and multiple (4+) Actions Taken', async () => {
    const actionCounts = (await seededTickets()).map((t) => t.actionsTaken.length);
    expect(actionCounts).toContain(0);
    expect(actionCounts).toContain(1);
    expect(Math.max(...actionCounts)).toBeGreaterThanOrEqual(4);
  });

  it('has one ticket whose actions were performed by two staff members, one of them not the owner (BR-02)', async () => {
    const tickets = await seededTickets();
    const multi = tickets.reduce((most, t) => (t.actionsTaken.length > most.actionsTaken.length ? t : most));
    const performers = new Set(multi.actionsTaken.map((a) => a.performedById).filter((id) => id !== null));
    expect(performers.size).toBeGreaterThanOrEqual(2);
    expect([...performers].some((id) => id !== multi.ticketOwnerId)).toBe(true);
    expect(new Set(multi.actionsTaken.map((a) => a.status))).toEqual(
      new Set(['COMPLETED', 'PLANNED', 'CANCELLED']),
    );
    expect(multi.actionsTaken.some((a) => a.followUpRequired && a.followUpNote)).toBe(true);
  });

  it('every seeded action respects BR-03/BR-04/BR-05: completed ones have result and performer, follow-up has a note', async () => {
    const actions = (await seededTickets()).flatMap((t) => t.actionsTaken);
    for (const a of actions) {
      if (a.status === 'COMPLETED') {
        expect(a.result).toBeTruthy();
        expect(a.performedById).not.toBeNull();
        expect(a.completedAt).not.toBeNull();
      } else {
        expect(a.performedById).toBeNull();
      }
      if (a.status === 'CANCELLED') expect(a.cancelReason).toBeTruthy();
      expect(Boolean(a.followUpNote)).toBe(a.followUpRequired);
    }
  });

  it('includes a resolvable active ticket (owner, completed action, no open actions) and one blocked by an open action', async () => {
    const active = (await seededTickets()).filter((t) =>
      (ACTIVE_STATUSES as readonly string[]).includes(t.currentStatus),
    );
    const open = (a: { status: string }) => a.status === 'PLANNED' || a.status === 'IN_PROGRESS';
    const resolvable = active.filter(
      (t) => t.ticketOwnerId !== null && t.actionsTaken.some((a) => a.status === 'COMPLETED') && !t.actionsTaken.some(open),
    );
    const blocked = active.filter((t) => t.actionsTaken.some(open));
    expect(resolvable.length).toBeGreaterThanOrEqual(1);
    expect(blocked.length).toBeGreaterThanOrEqual(1);
  });

  it('has an open action still assigned to the inactive kevin.patel (BR-06 demo)', async () => {
    const kevin = await userId('kevin.patel@toktickit.com');
    const count = await prisma.actionTaken.count({
      where: { assigneeId: kevin, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('has an active ticket the requester marked as appears-resolved (requesterMarkedResolved > 0)', async () => {
    const tickets = await seededTickets();
    expect(
      tickets.some(
        (t) => t.requesterResolvedIndicator && (ACTIVE_STATUSES as readonly string[]).includes(t.currentStatus),
      ),
    ).toBe(true);
  });

  // Whether a given resolvedAt is inside the rolling 7-day window depends on when the seed first
  // ran, so the window boundary itself is tested with fixed fixtures in API-L4-24.
  it('gives RESOLVED/CLOSED seeded tickets a resolvedAt and active ones none (BR-15)', async () => {
    for (const t of await seededTickets()) {
      if (t.currentStatus === 'RESOLVED' || t.currentStatus === 'CLOSED') {
        expect(t.resolvedAt).not.toBeNull();
      } else if ((ACTIVE_STATUSES as readonly string[]).includes(t.currentStatus)) {
        expect(t.resolvedAt).toBeNull();
      }
    }
  });

  it('gives every seeded ticket status history that ends in its current status, oldest first', async () => {
    for (const t of await seededTickets()) {
      const history = await prisma.ticketStatusChange.findMany({
        where: { ticketId: t.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[history.length - 1].toStatus).toBe(t.currentStatus);
    }
  });

  it('keeps nina.wong (Requester) with no tickets and olivia.chen (IT Staff) with no owned tickets or actions', async () => {
    const nina = await prisma.user.findUniqueOrThrow({ where: { email: 'nina.wong@toktickit.com' } });
    const olivia = await prisma.user.findUniqueOrThrow({ where: { email: 'olivia.chen@toktickit.com' } });
    expect(nina.role).toBe('REQUESTER');
    expect(nina.isActive).toBe(true);
    expect(olivia.role).toBe('IT_STAFF');
    expect(olivia.isActive).toBe(true);
    expect(await prisma.ticket.count({ where: { requesterId: nina.id } })).toBe(0);
    expect(await prisma.ticket.count({ where: { ticketOwnerId: olivia.id } })).toBe(0);
    expect(await prisma.actionTaken.count({ where: { assigneeId: olivia.id } })).toBe(0);
  });
});
