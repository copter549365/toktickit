/**
 * server/tests/lab-03/staff-queue.api.test.ts
 *
 * Tests: API-12, API-13, API-14, API-15 (docs/lab-03/tests.md §2)
 * GET /api/staff/tickets — search, filter, sort, pagination, and role authorization
 * (AC-05, FR-14, FR-15).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const PASSWORD = 'StaffQueueTestPassword456!';
const EMAIL_STAFF = 'staff-queue-it-staff@toktickit.com';
const EMAIL_STAFF_2 = 'staff-queue-it-staff-2@toktickit.com';
const EMAIL_REQUESTER = 'staff-queue-requester@toktickit.com';

let staff: { id: number; email: string };
let staff2: { id: number; email: string };
let requester: { id: number; email: string };
let cookieStaff: string;
let cookieStaff2: string;
let cookieRequester: string;
let categoryOne: { id: number };
let categoryTwo: { id: number };
let relatedSystemId: number;
const createdTicketIds: number[] = [];

// mustChangePassword stays true on every database row (see requester-regression.test.ts's
// file comment for why) — each test session carries mustChangePassword=false as a JWT claim.
function sessionCookieFor(user: { id: number; email: string }, role: 'REQUESTER' | 'IT_STAFF'): string {
  const token = signSessionToken({ userId: user.id, email: user.email, role, mustChangePassword: false });
  return `toktickit_session=${token}`;
}

const runToken = `StaffQueueRun${Date.now()}`;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const s1 = await prisma.user.upsert({
    where: { email: EMAIL_STAFF },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Staff Queue Tester', email: EMAIL_STAFF, passwordHash, role: 'IT_STAFF', isActive: true, mustChangePassword: true },
  });
  const s2 = await prisma.user.upsert({
    where: { email: EMAIL_STAFF_2 },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Staff Queue Tester Two', email: EMAIL_STAFF_2, passwordHash, role: 'IT_STAFF', isActive: true, mustChangePassword: true },
  });
  const r = await prisma.user.upsert({
    where: { email: EMAIL_REQUESTER },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Staff Queue Requester', email: EMAIL_REQUESTER, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: true },
  });
  staff = { id: s1.id, email: s1.email };
  staff2 = { id: s2.id, email: s2.email };
  requester = { id: r.id, email: r.email };

  cookieStaff = sessionCookieFor(staff, 'IT_STAFF');
  cookieStaff2 = sessionCookieFor(staff2, 'IT_STAFF');
  cookieRequester = sessionCookieFor(requester, 'REQUESTER');

  const categories = await prisma.category.findMany({ take: 2 });
  categoryOne = categories[0];
  categoryTwo = categories[1];
  relatedSystemId = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!.id;

  const ticketDefs = [
    { summary: `${runToken} laptop battery drains quickly`, categoryId: categoryOne.id, requestedPriority: 'HIGH' as const, itPriority: 'HIGH' as const, currentStatus: 'NEW' as const, ticketOwnerId: null },
    { summary: `${runToken} vpn will not connect`, categoryId: categoryTwo.id, requestedPriority: 'MEDIUM' as const, itPriority: 'MEDIUM' as const, currentStatus: 'IN_PROGRESS' as const, ticketOwnerId: staff.id },
    { summary: `${runToken} printer offline`, categoryId: categoryOne.id, requestedPriority: 'LOW' as const, itPriority: 'LOW' as const, currentStatus: 'OPEN' as const, ticketOwnerId: staff2.id },
    { summary: `${runToken} email locked out`, categoryId: categoryTwo.id, requestedPriority: 'HIGH' as const, itPriority: 'HIGH' as const, currentStatus: 'RESOLVED' as const, ticketOwnerId: staff.id },
  ];

  for (let i = 0; i < ticketDefs.length; i++) {
    const def = ticketDefs[i];
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-1992-${String(i + 1).padStart(6, '0')}`,
        requesterId: requester.id,
        categoryId: def.categoryId,
        relatedSystemId,
        summary: def.summary,
        description: 'Fixture ticket created for staff queue regression tests.',
        requestedPriority: def.requestedPriority,
        itPriority: def.itPriority,
        currentStatus: def.currentStatus,
        ticketOwnerId: def.ticketOwnerId,
      },
    });
    createdTicketIds.push(ticket.id);
  }
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_STAFF, EMAIL_STAFF_2, EMAIL_REQUESTER] } } });
  await prisma.$disconnect();
});

describe('API-12: GET /api/staff/tickets (AC-05, FR-14)', () => {
  it('returns tickets across all requesters with pagination metadata', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff)
      .query({ search: runToken, pageSize: 50 });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(4);
    expect(response.body.meta).toEqual(
      expect.objectContaining({ page: 1, pageSize: 50, totalCount: 4 }),
    );
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        ticketNumber: expect.any(String),
        category: expect.objectContaining({ id: expect.any(Number), name: expect.any(String) }),
        requester: expect.objectContaining({ id: requester.id, name: expect.any(String), email: requester.email }),
      }),
    );
  });

  it('an Administrator may also retrieve the queue', async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMINISTRATOR', isActive: true } });
    expect(admin).not.toBeNull();
    const cookieAdmin = signSessionToken({ userId: admin!.id, email: admin!.email, role: 'ADMINISTRATOR', mustChangePassword: false });

    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', `toktickit_session=${cookieAdmin}`)
      .query({ search: runToken });

    expect(response.status).toBe(200);
  });
});

describe('API-13: IT Staff queue search by Ticket Number or Summary (AC-05, FR-15)', () => {
  it('matches by summary text', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff)
      .query({ search: `${runToken} laptop battery` });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].summary).toContain('laptop battery drains quickly');
  });

  it('matches by ticket number', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff)
      .query({ search: 'TKT-1992-000002' });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].ticketNumber).toBe('TKT-1992-000002');
  });
});

describe('API-14: IT Staff queue filter by status, priority, category, owner (AC-05, FR-15)', () => {
  it('filters by currentStatus', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff)
      .query({ search: runToken, currentStatus: 'IN_PROGRESS' });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].currentStatus).toBe('IN_PROGRESS');
  });

  it('filters by itPriority', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff)
      .query({ search: runToken, itPriority: 'HIGH', pageSize: 50 });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);
    for (const ticket of response.body.data) {
      expect(ticket.itPriority).toBe('HIGH');
    }
  });

  it('filters by categoryId', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff)
      .query({ search: runToken, categoryId: categoryTwo.id, pageSize: 50 });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);
    for (const ticket of response.body.data) {
      expect(ticket.category.id).toBe(categoryTwo.id);
    }
  });

  it('filters by ticketOwnerId=unassigned', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff)
      .query({ search: runToken, ticketOwnerId: 'unassigned' });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].owner).toBeNull();
  });

  it('filters by a specific ticketOwnerId ("Assigned to Me")', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff)
      .query({ search: runToken, ticketOwnerId: staff.id, pageSize: 50 });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);
    for (const ticket of response.body.data) {
      expect(ticket.owner).toEqual(expect.objectContaining({ id: staff.id }));
    }
  });

  it('combines multiple filters', async () => {
    const response = await request(app)
      .get('/api/staff/tickets')
      .set('Cookie', cookieStaff2)
      .query({ search: runToken, ticketOwnerId: staff2.id, currentStatus: 'OPEN' });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].summary).toContain('printer offline');
  });
});

describe('API-15: Requester attempts to access staff queue (AC-05)', () => {
  it('returns 403 Forbidden', async () => {
    const response = await request(app).get('/api/staff/tickets').set('Cookie', cookieRequester);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('returns 401 with no session at all', async () => {
    const response = await request(app).get('/api/staff/tickets');
    expect(response.status).toBe(401);
  });
});
