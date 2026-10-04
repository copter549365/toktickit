/**
 * server/tests/lab-03/authorization.api.test.ts
 *
 * Tests: API-10, API-11, API-34 (docs/lab-03/tests.md §2)
 * Requester ticket ownership isolation (BR-03, AC-03) and the Cancel Ticket action (FR-13.1, BR-13).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const PASSWORD = 'AuthzTestPassword456!';
const EMAIL_A = 'authz-requester-a@toktickit.com';
const EMAIL_B = 'authz-requester-b@toktickit.com';

let requesterA: { id: number };
let requesterB: { id: number };
let cookieA: string;
let cookieB: string;
let categoryId: number;
let relatedSystemId: number;
const createdTicketIds: number[] = [];

// requireAuth re-reads mustChangePassword from the database on every request (PR #50 review),
// so these fixtures are created with mustChangePassword=false directly rather than forging a
// mismatched JWT claim.
function sessionCookieFor(user: { id: number; email: string }): string {
  const token = signSessionToken({ userId: user.id, email: user.email, role: 'REQUESTER', mustChangePassword: false });
  return `toktickit_session=${token}`;
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const a = await prisma.user.upsert({
    where: { email: EMAIL_A },
    update: { passwordHash, mustChangePassword: false, isActive: true },
    create: { name: 'Authz Requester A', email: EMAIL_A, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: false },
  });
  const b = await prisma.user.upsert({
    where: { email: EMAIL_B },
    update: { passwordHash, mustChangePassword: false, isActive: true },
    create: { name: 'Authz Requester B', email: EMAIL_B, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: false },
  });
  requesterA = { id: a.id };
  requesterB = { id: b.id };

  cookieA = sessionCookieFor({ id: a.id, email: a.email });
  cookieB = sessionCookieFor({ id: b.id, email: b.email });

  categoryId = (await prisma.category.findFirst())!.id;
  relatedSystemId = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!.id;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
  await prisma.$disconnect();
});

async function createTicketFor(requesterId: number, status: 'NEW' | 'IN_PROGRESS' = 'NEW') {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1995-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: 'Authorization fixture ticket',
      description: 'Fixture ticket created for authorization regression tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: status,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

describe('API-10: Requester ticket isolation on GET /api/tickets (BR-03, AC-03)', () => {
  it('never returns another Requester\'s tickets regardless of query parameters', async () => {
    const ticketA = await createTicketFor(requesterA.id);
    const ticketB = await createTicketFor(requesterB.id);

    const response = await request(app).get('/api/tickets').set('Cookie', cookieA).query({ pageSize: 50 });

    expect(response.status).toBe(200);
    const ids = response.body.data.map((t: { id: number }) => t.id);
    expect(ids).toContain(ticketA.id);
    expect(ids).not.toContain(ticketB.id);
  });
});

describe('API-11: Requester accessing another user\'s ticket detail returns 404 (BR-03, AC-03)', () => {
  it('does not leak the existence of another Requester\'s ticket', async () => {
    const ticketB = await createTicketFor(requesterB.id);

    const response = await request(app).get(`/api/tickets/${ticketB.id}`).set('Cookie', cookieA);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'TICKET_NOT_FOUND' });
  });
});

describe('API-34: PATCH /api/tickets/:id/cancel (FR-13.1, BR-13)', () => {
  it('cancels an owned ticket while still in NEW status', async () => {
    const ticket = await createTicketFor(requesterA.id, 'NEW');

    const response = await request(app)
      .patch(`/api/tickets/${ticket.id}/cancel`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieA)
      .send({ cancellationReason: 'Issue resolved itself after rebooting.' });

    expect(response.status).toBe(200);
    expect(response.body.currentStatus).toBe('CANCELLED');

    const saved = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(saved?.currentStatus).toBe('CANCELLED');
  });

  it('rejects cancelling a ticket that is already in progress with 400 TICKET_ALREADY_IN_PROGRESS', async () => {
    const ticket = await createTicketFor(requesterA.id, 'IN_PROGRESS');

    const response = await request(app)
      .patch(`/api/tickets/${ticket.id}/cancel`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieA)
      .send({ cancellationReason: 'Trying to cancel anyway.' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('TICKET_ALREADY_IN_PROGRESS');

    const saved = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(saved?.currentStatus).toBe('IN_PROGRESS');
  });

  it("rejects cancelling another Requester's ticket with 404", async () => {
    const ticket = await createTicketFor(requesterB.id, 'NEW');

    const response = await request(app)
      .patch(`/api/tickets/${ticket.id}/cancel`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieA)
      .send({ cancellationReason: 'Not my ticket.' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'TICKET_NOT_FOUND' });
  });
});
