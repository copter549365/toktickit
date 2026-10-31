/**
 * server/tests/lab-04/list-pagination.api.test.ts
 *
 * Regression for Lab 3 E2E-08, found during Lab 4 Issue 4: sorting My Tickets or the Staff Queue by
 * a column with many equal values (e.g. IT Priority) must still page deterministically, so no Ticket
 * appears on two pages and none is skipped. `id` is the tiebreaker.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const TOKEN = `L4PAGE${Date.now().toString(36)}`;
const EMAILS = { requester: 'l4-page-requester@toktickit.com', staff: 'l4-page-staff@toktickit.com' };
const TICKETS = 60;
const PAGE_SIZE = 10;

let requesterCookie: string;
let staffCookie: string;

beforeAll(async () => {
  const requester = await prisma.user.upsert({
    where: { email: EMAILS.requester },
    update: { isActive: true, mustChangePassword: false },
    create: { name: 'Paging Requester', email: EMAILS.requester, passwordHash: 'x', role: 'REQUESTER', mustChangePassword: false },
  });
  const staff = await prisma.user.upsert({
    where: { email: EMAILS.staff },
    update: { isActive: true, mustChangePassword: false },
    create: { name: 'Paging Staff', email: EMAILS.staff, passwordHash: 'x', role: 'IT_STAFF', mustChangePassword: false },
  });
  requesterCookie = `toktickit_session=${signSessionToken({ userId: requester.id, email: requester.email, role: 'REQUESTER', mustChangePassword: false })}`;
  staffCookie = `toktickit_session=${signSessionToken({ userId: staff.id, email: staff.email, role: 'IT_STAFF', mustChangePassword: false })}`;

  const categoryId = (await prisma.category.findFirst())!.id;
  const relatedSystemId = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!.id;
  const sameTime = new Date();
  const base = Math.floor(Math.random() * 800000) + 100000;
  await prisma.ticket.createMany({
    data: Array.from({ length: TICKETS }, (_, i) => ({
      ticketNumber: `TKT-1995-${base + i}`,
      requesterId: requester.id,
      categoryId,
      relatedSystemId,
      summary: `${TOKEN} paging fixture ${i}`,
      description: 'Fixture ticket for deterministic pagination with tied sort values.',
      requestedPriority: 'MEDIUM' as const,
      itPriority: 'MEDIUM' as const, // every row ties on the sort column
      currentStatus: 'NEW' as const,
      createdAt: sameTime,
      updatedAt: sameTime,
    })),
  });
});

afterAll(async () => {
  // By requester, not TOKEN, so rows left by an interrupted earlier run are removed too.
  await prisma.ticket.deleteMany({ where: { requester: { email: EMAILS.requester } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.$disconnect();
});

async function allPages(path: string, cookie: string, sortBy: string): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= Math.ceil(TICKETS / PAGE_SIZE); page++) {
    const res = await request(app)
      .get(path)
      .query({ search: TOKEN, sortBy, sortOrder: 'asc', page, pageSize: PAGE_SIZE })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    ids.push(...res.body.data.map((t: { id: number }) => t.id));
  }
  return ids;
}

describe('Deterministic pagination when the sort column ties', () => {
  it.each(['itPriority', 'requestedPriority', 'createdAt', 'currentStatus'])(
    'Staff Queue sorted by %s returns every Ticket exactly once across pages',
    async (sortBy) => {
      const ids = await allPages('/api/staff/tickets', staffCookie, sortBy);
      expect(ids).toHaveLength(TICKETS);
      expect(new Set(ids).size).toBe(TICKETS);
    },
  );

  it.each(['requestedPriority', 'createdAt', 'currentStatus'])(
    'My Tickets sorted by %s returns every Ticket exactly once across pages',
    async (sortBy) => {
      const ids = await allPages('/api/tickets', requesterCookie, sortBy);
      expect(ids).toHaveLength(TICKETS);
      expect(new Set(ids).size).toBe(TICKETS);
    },
  );
});
