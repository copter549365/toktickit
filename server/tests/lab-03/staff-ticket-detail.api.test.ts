/**
 * server/tests/lab-03/staff-ticket-detail.api.test.ts
 *
 * Test: API-31 (docs/lab-03/tests.md §2) — Requester "Problem Appears Resolved" indicator
 * (PATCH /api/tickets/:id/resolve-indicator, FR-13, BR-06, AC-15).
 *
 * This file is named for the IT Staff Ticket Detail suite per the required Lab 3 test
 * structure; Issue 6 (IT Staff Ticket Detail & Operational Workflow) extends it with the
 * owner/priority/status transition tests (API-16..API-21) once those endpoints land.
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

let requester: { id: number };
let cookie: string;
let categoryId: number;
let relatedSystemId: number;
const createdTicketIds: number[] = [];

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const u = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Resolve Indicator Requester', email: EMAIL, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: true },
  });
  requester = { id: u.id };

  // mustChangePassword stays true on the database row (see requester-regression.test.ts's file
  // comment for why) — the test session carries mustChangePassword=false as a JWT claim only.
  const token = signSessionToken({ userId: u.id, email: u.email, role: 'REQUESTER', mustChangePassword: false });
  cookie = `toktickit_session=${token}`;

  categoryId = (await prisma.category.findFirst())!.id;
  relatedSystemId = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!.id;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

async function createTicket(status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED') {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1993-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId: requester.id,
      categoryId,
      relatedSystemId,
      summary: 'Resolve indicator fixture ticket',
      description: 'Fixture ticket created for resolve-indicator regression tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: status,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

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
