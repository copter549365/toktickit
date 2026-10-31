/**
 * server/tests/lab-04/performance-smoke.test.ts
 *
 * Tests: PERF-L4-01 and PERF-L4-02 (docs/lab-04/tests.md §2.5; AC-28). With 1,000 extra Tickets
 * and 3,000 extra Actions Taken in the local test database, each dashboard endpoint answers in
 * under 500 ms and the Actions Taken list of a Ticket with 50 actions in under 300 ms, measured as
 * the median of 5 runs (after one warm-up call). The data is created with createMany and removed
 * afterwards.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const PREFIX = 'l4-perf';
const TICKETS = 1000;
const ACTIONS = 3000;
const ACTIONS_ON_BUSY_TICKET = 50;
const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
const ACTION_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

let requesterCookie: string;
let staffCookie: string;
let adminCookie: string;
let busyTicketId: number;

async function makeUser(key: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') {
  const email = `${PREFIX}-${key}@toktickit.com`;
  const u = await prisma.user.upsert({
    where: { email },
    update: { role, isActive: true, mustChangePassword: false },
    create: { name: `Perf ${key}`, email, passwordHash: 'x', role, isActive: true, mustChangePassword: false },
  });
  return { id: u.id, cookie: `toktickit_session=${signSessionToken({ userId: u.id, email, role, mustChangePassword: false })}` };
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: `${PREFIX}-` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } }); // actions cascade (D-11)
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

/** Median response time of `runs` calls, after one warm-up call that is not counted. */
async function medianMs(call: () => Promise<request.Response>, runs = 5): Promise<number> {
  expect((await call()).status).toBe(200);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const res = await call();
    times.push(performance.now() - start);
    expect(res.status).toBe(200);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(runs / 2)]!;
}

beforeAll(async () => {
  await cleanup();
  const requester = await makeUser('requester', 'REQUESTER');
  const staff = await makeUser('staff', 'IT_STAFF');
  const admin = await makeUser('admin', 'ADMINISTRATOR');
  requesterCookie = requester.cookie;
  staffCookie = staff.cookie;
  adminCookie = admin.cookie;
  const categoryId = (await prisma.category.findFirstOrThrow()).id;
  const relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id;

  const now = Date.now();
  const stamp = String(now).slice(-5);
  await prisma.ticket.createMany({
    data: Array.from({ length: TICKETS }, (_, i) => {
      const status = STATUSES[i % STATUSES.length]!;
      return {
        ticketNumber: `TKT-1992-${stamp}${String(i).padStart(4, '0')}`,
        requesterId: requester.id,
        categoryId,
        relatedSystemId,
        summary: `Performance fixture ${i}`,
        description: 'Generated for the Lab 4 performance smoke test.',
        requestedPriority: 'MEDIUM',
        itPriority: PRIORITIES[i % PRIORITIES.length],
        currentStatus: status,
        ticketOwnerId: i % 3 === 0 ? null : staff.id,
        requesterResolvedIndicator: i % 17 === 0 && status !== 'RESOLVED' && status !== 'CLOSED' && status !== 'CANCELLED',
        resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date(now - (i % 14) * 24 * 60 * 60 * 1000) : null,
        createdAt: new Date(now - i * 60 * 1000),
      };
    }),
  });
  const tickets = await prisma.ticket.findMany({ where: { requesterId: requester.id }, select: { id: true, createdAt: true }, orderBy: { id: 'asc' } });
  expect(tickets).toHaveLength(TICKETS);
  busyTicketId = tickets[0]!.id;

  // 50 actions on one Ticket, the rest spread over the others.
  await prisma.actionTaken.createMany({
    data: Array.from({ length: ACTIONS }, (_, i) => {
      const ticket = i < ACTIONS_ON_BUSY_TICKET ? tickets[0]! : tickets[1 + (i % (TICKETS - 1))]!;
      const status = ACTION_STATUSES[i % ACTION_STATUSES.length]!;
      return {
        ticketId: ticket.id,
        clientRequestId: randomUUID(),
        actionAt: new Date(ticket.createdAt.getTime() + (i + 1) * 1000),
        description: `Performance fixture action ${i}`,
        status,
        result: status === 'COMPLETED' ? 'Generated result.' : null,
        cancelReason: status === 'CANCELLED' ? 'Generated cancel reason.' : null,
        assigneeId: staff.id,
        createdById: staff.id,
        lastUpdatedById: staff.id,
        performedById: status === 'COMPLETED' ? staff.id : null,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      };
    }),
  });
}, 120_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
}, 120_000);

describe('PERF-L4-01: dashboards with 1,000 Tickets and 3,000 actions (AC-28)', () => {
  it('GET /api/dashboard/requester for the Requester who owns all 1,000: median < 500 ms', async () => {
    const ms = await medianMs(() => request(app).get('/api/dashboard/requester').set('Cookie', requesterCookie));
    console.info(`PERF-L4-01 requester dashboard median: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(500);
  });

  it('GET /api/dashboard/staff for the staff member assigned all 3,000 actions: median < 500 ms', async () => {
    const ms = await medianMs(() => request(app).get('/api/dashboard/staff').set('Cookie', staffCookie));
    console.info(`PERF-L4-01 staff dashboard median: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(500);
  });

  it('GET /api/dashboard/staff as an Administrator (adds user counts): median < 500 ms', async () => {
    const ms = await medianMs(() => request(app).get('/api/dashboard/staff').set('Cookie', adminCookie));
    console.info(`PERF-L4-01 admin dashboard median: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(500);
  });
});

describe('PERF-L4-02: Actions Taken list for one Ticket with 50 actions (AC-28)', () => {
  it('GET /api/tickets/:id/actions: median < 300 ms, and all 50 are returned', async () => {
    const res = await request(app).get(`/api/tickets/${busyTicketId}/actions`).set('Cookie', staffCookie);
    expect(res.body.data).toHaveLength(ACTIONS_ON_BUSY_TICKET);
    const ms = await medianMs(() => request(app).get(`/api/tickets/${busyTicketId}/actions`).set('Cookie', staffCookie));
    console.info(`PERF-L4-02 actions list median: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(300);
  });
});
