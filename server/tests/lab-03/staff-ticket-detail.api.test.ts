/**
 * server/tests/lab-03/staff-ticket-detail.api.test.ts
 *
 * Tests: API-16..API-21, API-31 (docs/lab-03/tests.md §2) — IT Staff Ticket Detail
 * operational workflow: GET /api/staff/tickets/:id, PATCH .../owner, .../priority,
 * .../status (BR-13), and the Requester "Problem Appears Resolved" indicator
 * (PATCH /api/tickets/:id/resolve-indicator, FR-13, BR-06, AC-15).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const PASSWORD = 'ResolveIndicatorPassword456!';
const EMAIL = 'resolve-indicator-requester@toktickit.com';
const EMAIL_STAFF = 'staff-detail-it-staff@toktickit.com';
const EMAIL_STAFF_2 = 'staff-detail-it-staff-2@toktickit.com';
const EMAIL_STAFF_INACTIVE = 'staff-detail-it-staff-inactive@toktickit.com';

let requester: { id: number };
let staff: { id: number; email: string };
let staff2: { id: number; email: string };
let staffInactive: { id: number; email: string };
let cookie: string;
let cookieStaff: string;
let categoryId: number;
let relatedSystemId: number;
const createdTicketIds: number[] = [];

function sessionCookieFor(user: { id: number; email: string }, role: 'REQUESTER' | 'IT_STAFF'): string {
  const token = signSessionToken({ userId: user.id, email: user.email, role, mustChangePassword: false });
  return `toktickit_session=${token}`;
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const u = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Resolve Indicator Requester', email: EMAIL, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: true },
  });
  requester = { id: u.id };

  const s1 = await prisma.user.upsert({
    where: { email: EMAIL_STAFF },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Staff Detail Tester', email: EMAIL_STAFF, passwordHash, role: 'IT_STAFF', isActive: true, mustChangePassword: true },
  });
  const s2 = await prisma.user.upsert({
    where: { email: EMAIL_STAFF_2 },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Staff Detail Tester Two', email: EMAIL_STAFF_2, passwordHash, role: 'IT_STAFF', isActive: true, mustChangePassword: true },
  });
  const s3 = await prisma.user.upsert({
    where: { email: EMAIL_STAFF_INACTIVE },
    update: { passwordHash, mustChangePassword: true, isActive: false },
    create: { name: 'Staff Detail Tester Inactive', email: EMAIL_STAFF_INACTIVE, passwordHash, role: 'IT_STAFF', isActive: false, mustChangePassword: true },
  });
  staff = { id: s1.id, email: s1.email };
  staff2 = { id: s2.id, email: s2.email };
  staffInactive = { id: s3.id, email: s3.email };

  // mustChangePassword stays true on the database row (see requester-regression.test.ts's file
  // comment for why) — the test session carries mustChangePassword=false as a JWT claim only.
  cookie = sessionCookieFor({ id: u.id, email: u.email }, 'REQUESTER');
  cookieStaff = sessionCookieFor(staff, 'IT_STAFF');

  categoryId = (await prisma.category.findFirst())!.id;
  relatedSystemId = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!.id;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EMAIL_STAFF, EMAIL_STAFF_2, EMAIL_STAFF_INACTIVE] } } });
  await prisma.$disconnect();
});

async function createTicket(
  status: 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED',
  overrides: Partial<{ ticketOwnerId: number | null }> = {},
) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1993-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId: requester.id,
      categoryId,
      relatedSystemId,
      summary: 'Resolve indicator fixture ticket',
      description: 'Fixture ticket created for staff ticket detail regression tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: status,
      ticketOwnerId: overrides.ticketOwnerId ?? null,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

describe('GET /api/staff/tickets/:id (api-spec.md §4)', () => {
  it('returns the full operational payload including permitted next statuses', async () => {
    const ticket = await createTicket('OPEN', { ticketOwnerId: staff.id });

    const response = await request(app).get(`/api/staff/tickets/${ticket.id}`).set('Cookie', cookieStaff);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: ticket.id,
        requester: expect.objectContaining({ id: requester.id }),
        owner: expect.objectContaining({ id: staff.id }),
        currentStatus: 'OPEN',
        permittedNextStatuses: expect.arrayContaining(['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED']),
      }),
    );
  });

  it('rejects a Requester with 403', async () => {
    const ticket = await createTicket('OPEN');
    const response = await request(app).get(`/api/staff/tickets/${ticket.id}`).set('Cookie', cookie);
    expect(response.status).toBe(403);
  });
});

describe('GET /api/attachments/:id and /download — IT Staff may access any ticket\'s attachments', () => {
  it('returns attachment metadata for a ticket the staff member does not own', async () => {
    const ticket = await createTicket('OPEN');
    const attachment = await prisma.attachment.create({
      data: {
        ticketId: ticket.id,
        originalFileName: 'diagnostic.png',
        storedFileName: 'staff-detail-test-fixture.png',
        mimeType: 'image/png',
        fileSizeBytes: 1024,
        isRemoved: false,
      },
    });

    const response = await request(app).get(`/api/attachments/${attachment.id}`).set('Cookie', cookieStaff);

    expect(response.status).toBe(200);
    expect(response.body.originalFileName).toBe('diagnostic.png');

    await prisma.attachment.delete({ where: { id: attachment.id } });
  });
});

describe('GET /api/staff/users — reference data for the owner reassignment dropdown', () => {
  it('returns only active IT Staff and Administrators', async () => {
    const response = await request(app).get('/api/staff/users').set('Cookie', cookieStaff);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const ids = response.body.map((m: { id: number }) => m.id);
    expect(ids).toContain(staff.id);
    expect(ids).toContain(staff2.id);
    expect(ids).not.toContain(staffInactive.id);
    for (const member of response.body) {
      expect(['IT_STAFF', 'ADMINISTRATOR']).toContain(member.role);
    }
  });

  it('rejects a Requester with 403', async () => {
    const response = await request(app).get('/api/staff/users').set('Cookie', cookie);
    expect(response.status).toBe(403);
  });
});

describe('API-16/API-17: PATCH /api/staff/tickets/:id/owner (claim & reassign)', () => {
  it('API-16: claims an unassigned ticket for the acting staff member', async () => {
    const ticket = await createTicket('NEW');

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ ticketOwnerId: staff.id });

    expect(response.status).toBe(200);
    expect(response.body.owner).toEqual(expect.objectContaining({ id: staff.id }));

    const saved = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(saved?.ticketOwnerId).toBe(staff.id);
  });

  it('API-17: reassigns ownership to another active staff member', async () => {
    const ticket = await createTicket('OPEN', { ticketOwnerId: staff.id });

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ ticketOwnerId: staff2.id });

    expect(response.status).toBe(200);
    expect(response.body.owner).toEqual(expect.objectContaining({ id: staff2.id }));
  });

  it('unassigns a ticket when ticketOwnerId is null', async () => {
    const ticket = await createTicket('OPEN', { ticketOwnerId: staff.id });

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ ticketOwnerId: null });

    expect(response.status).toBe(200);
    expect(response.body.ticketOwnerId).toBeNull();
    expect(response.body.owner).toBeNull();
  });

  it('API-18: rejects assigning ownership to a Requester user', async () => {
    const ticket = await createTicket('NEW');

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ ticketOwnerId: requester.id });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TICKET_OWNER');
  });

  it('rejects assigning ownership to an inactive IT Staff user', async () => {
    const ticket = await createTicket('NEW');

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/owner`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ ticketOwnerId: staffInactive.id });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TICKET_OWNER');
  });
});

describe('API-19: PATCH /api/staff/tickets/:id/priority', () => {
  it('updates itPriority without altering the original requestedPriority', async () => {
    const ticket = await createTicket('NEW');

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/priority`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ itPriority: 'HIGH' });

    expect(response.status).toBe(200);
    expect(response.body.itPriority).toBe('HIGH');

    const saved = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(saved?.itPriority).toBe('HIGH');
    expect(saved?.requestedPriority).toBe('MEDIUM');
  });

  it('rejects an invalid priority value', async () => {
    const ticket = await createTicket('NEW');

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/priority`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ itPriority: 'URGENT' });

    expect(response.status).toBe(400);
  });
});

describe('API-20/API-21: PATCH /api/staff/tickets/:id/status (BR-13)', () => {
  it('API-20: advances a valid transition (OPEN to IN_PROGRESS)', async () => {
    const ticket = await createTicket('OPEN');

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ status: 'IN_PROGRESS' });

    expect(response.status).toBe(200);
    expect(response.body.currentStatus).toBe('IN_PROGRESS');
  });

  it('API-21: rejects an invalid jump (NEW to RESOLVED)', async () => {
    const ticket = await createTicket('NEW');

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ status: 'RESOLVED' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_STATUS_TRANSITION');

    const saved = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(saved?.currentStatus).toBe('NEW');
  });

  it('requires a resolutionSummary (min 5 chars) when transitioning to RESOLVED', async () => {
    const ticket = await createTicket('IN_PROGRESS');

    const missing = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ status: 'RESOLVED' });
    expect(missing.status).toBe(400);
    expect(missing.body.fieldErrors).toHaveProperty('resolutionSummary');

    const ok = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ status: 'RESOLVED', resolutionSummary: 'Replaced the faulty network cable.' });
    expect(ok.status).toBe(200);
    expect(ok.body.resolutionSummary).toBe('Replaced the faulty network cable.');
  });

  it('requires a reopenReason (min 5 chars) when transitioning from RESOLVED to REOPENED', async () => {
    const ticket = await createTicket('RESOLVED');

    const missing = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ status: 'REOPENED' });
    expect(missing.status).toBe(400);
    expect(missing.body.fieldErrors).toHaveProperty('reopenReason');

    const ok = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ status: 'REOPENED', reopenReason: 'Problem recurred overnight.' });
    expect(ok.status).toBe(200);
    expect(ok.body.currentStatus).toBe('REOPENED');
  });

  it('rejects a Requester session with 403', async () => {
    const ticket = await createTicket('OPEN');

    const response = await request(app)
      .patch(`/api/staff/tickets/${ticket.id}/status`)
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({ status: 'IN_PROGRESS' });

    expect(response.status).toBe(403);
  });
});

describe('API-31: PATCH /api/tickets/:id/resolve-indicator (FR-13, BR-06, AC-15)', () => {
  it('sets requesterResolvedIndicator=true without changing currentStatus, while ticket is IN_PROGRESS', async () => {
    const ticket = await createTicket('IN_PROGRESS');

    const response = await request(app)
      .patch(`/api/tickets/${ticket.id}/resolve-indicator`)
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({ appearsResolved: true });

    expect(response.status).toBe(200);
    expect(response.body.requesterResolvedIndicator).toBe(true);

    const saved = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(saved?.requesterResolvedIndicator).toBe(true);
    // BR-06: the Requester's action never formally resolves or closes the ticket.
    expect(saved?.currentStatus).toBe('IN_PROGRESS');
  });

  it('rejects the action while the ticket is still NEW', async () => {
    const ticket = await createTicket('NEW');

    const response = await request(app)
      .patch(`/api/tickets/${ticket.id}/resolve-indicator`)
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({ appearsResolved: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TICKET_STATUS');
  });

  it('rejects the action once the ticket is already RESOLVED', async () => {
    const ticket = await createTicket('RESOLVED');

    const response = await request(app)
      .patch(`/api/tickets/${ticket.id}/resolve-indicator`)
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({ appearsResolved: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TICKET_STATUS');
  });
});
