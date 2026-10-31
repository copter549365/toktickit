/**
 * server/tests/lab-04/authorization.api.test.ts
 *
 * Tests: SEC-L4-01 (docs/lab-04/tests.md §2.5; AC-08, AC-21, BR-26, BR-28). Every new or changed
 * Lab 4 route is called by each persona — anonymous, must-change-password, the owning Requester,
 * another Requester, IT Staff, and an Administrator — and must return the status in api-spec §4.
 * Every refusal uses the safe error envelope and never echoes Ticket data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const PREFIX = 'l4-authz';
const SECRET_SUMMARY = 'AUTHZ-SECRET-SUMMARY do not leak';
const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
type Persona = 'anonymous' | 'mustChange' | 'owner' | 'otherRequester' | 'staff' | 'admin';
type Status = 'NEW' | 'IN_PROGRESS';
const PERSONAS: Persona[] = ['anonymous', 'mustChange', 'owner', 'otherRequester', 'staff', 'admin'];

const cookies: Partial<Record<Persona, string>> = {};
const ids: Partial<Record<Persona, number>> = {};
let categoryId: number;
let relatedSystemId: number;

async function makeUser(persona: Persona, role: Role, mustChangePassword = false) {
  const email = `${PREFIX}-${persona}@toktickit.com`;
  const u = await prisma.user.upsert({
    where: { email },
    update: { role, isActive: true, mustChangePassword },
    create: { name: `Authz ${persona}`, email, passwordHash: 'x', role, isActive: true, mustChangePassword },
  });
  ids[persona] = u.id;
  cookies[persona] = `toktickit_session=${signSessionToken({ userId: u.id, email, role, mustChangePassword })}`;
}

/** A fresh Ticket per call, so a successful write in one cell cannot change another cell. */
async function freshTicket(status: Status = 'IN_PROGRESS') {
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1993-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId: ids.owner!,
      categoryId,
      relatedSystemId,
      summary: SECRET_SUMMARY,
      description: 'Fixture ticket for the Lab 4 authorization matrix.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: status,
      ticketOwnerId: ids.staff!,
    },
  });
}

async function freshAction(ticketId: number) {
  return prisma.actionTaken.create({
    data: {
      ticketId,
      clientRequestId: randomUUID(),
      actionAt: new Date(),
      description: 'Authorization matrix fixture action',
      status: 'PLANNED',
      assigneeId: ids.staff!,
      createdById: ids.staff!,
      lastUpdatedById: ids.staff!,
    },
  });
}

interface Route {
  name: string;
  /** Expected status for each persona (api-spec §4; a wrong-owner Requester gets 404). */
  expected: Record<Persona, number>;
  call: (cookie: string | undefined) => Promise<request.Response>;
}

const send = (r: request.Test, cookie?: string) => (cookie ? r.set('Cookie', cookie) : r);

const ROUTES: Route[] = [
  {
    name: 'GET /api/tickets/:id/actions',
    expected: { anonymous: 401, mustChange: 403, owner: 200, otherRequester: 404, staff: 200, admin: 200 },
    call: async (c) => send(request(app).get(`/api/tickets/${(await freshTicket()).id}/actions`), c),
  },
  {
    name: 'POST /api/tickets/:id/actions',
    expected: { anonymous: 401, mustChange: 403, owner: 403, otherRequester: 403, staff: 201, admin: 201 },
    call: async (c) =>
      send(
        request(app)
          .post(`/api/tickets/${(await freshTicket()).id}/actions`)
          .set(JSON_HEADERS)
          .send({ clientRequestId: randomUUID(), description: 'Matrix action create' }),
        c,
      ),
  },
  {
    name: 'PATCH /api/tickets/:id/actions/:actionId',
    expected: { anonymous: 401, mustChange: 403, owner: 403, otherRequester: 403, staff: 200, admin: 200 },
    call: async (c) => {
      const ticket = await freshTicket();
      const action = await freshAction(ticket.id);
      return send(
        request(app)
          .patch(`/api/tickets/${ticket.id}/actions/${action.id}`)
          .set(JSON_HEADERS)
          .send({ expectedVersion: 1, description: 'Matrix action edit' }),
        c,
      );
    },
  },
  {
    name: 'PATCH /api/staff/tickets/:id/status',
    expected: { anonymous: 401, mustChange: 403, owner: 403, otherRequester: 403, staff: 200, admin: 200 },
    call: async (c) =>
      send(request(app).patch(`/api/staff/tickets/${(await freshTicket()).id}/status`).set(JSON_HEADERS).send({ status: 'WAITING_FOR_REQUESTER' }), c),
  },
  {
    name: 'PATCH /api/staff/tickets/:id/owner',
    expected: { anonymous: 401, mustChange: 403, owner: 403, otherRequester: 403, staff: 200, admin: 200 },
    call: async (c) =>
      send(request(app).patch(`/api/staff/tickets/${(await freshTicket()).id}/owner`).set(JSON_HEADERS).send({ ticketOwnerId: ids.staff }), c),
  },
  {
    name: 'PATCH /api/staff/tickets/:id/priority',
    expected: { anonymous: 401, mustChange: 403, owner: 403, otherRequester: 403, staff: 200, admin: 200 },
    call: async (c) =>
      send(request(app).patch(`/api/staff/tickets/${(await freshTicket()).id}/priority`).set(JSON_HEADERS).send({ itPriority: 'HIGH' }), c),
  },
  {
    name: 'GET /api/tickets/:id/status-history',
    expected: { anonymous: 401, mustChange: 403, owner: 200, otherRequester: 404, staff: 200, admin: 200 },
    call: async (c) => send(request(app).get(`/api/tickets/${(await freshTicket()).id}/status-history`), c),
  },
  {
    name: 'PATCH /api/tickets/:id/resolve-indicator',
    expected: { anonymous: 401, mustChange: 403, owner: 200, otherRequester: 404, staff: 403, admin: 403 },
    call: async (c) =>
      send(request(app).patch(`/api/tickets/${(await freshTicket()).id}/resolve-indicator`).set(JSON_HEADERS).send({ appearsResolved: true }), c),
  },
  {
    name: 'PATCH /api/tickets/:id/cancel',
    expected: { anonymous: 401, mustChange: 403, owner: 200, otherRequester: 404, staff: 403, admin: 403 },
    call: async (c) =>
      send(
        request(app).patch(`/api/tickets/${(await freshTicket('NEW')).id}/cancel`).set(JSON_HEADERS).send({ cancellationReason: 'No longer needed.' }),
        c,
      ),
  },
  {
    name: 'GET /api/dashboard/requester',
    expected: { anonymous: 401, mustChange: 403, owner: 200, otherRequester: 200, staff: 403, admin: 403 },
    call: async (c) => send(request(app).get('/api/dashboard/requester'), c),
  },
  {
    name: 'GET /api/dashboard/staff',
    expected: { anonymous: 401, mustChange: 403, owner: 403, otherRequester: 403, staff: 200, admin: 200 },
    call: async (c) => send(request(app).get('/api/dashboard/staff'), c),
  },
  {
    name: 'GET /api/tickets?statusGroup=active',
    expected: { anonymous: 401, mustChange: 403, owner: 200, otherRequester: 200, staff: 403, admin: 403 },
    call: async (c) => send(request(app).get('/api/tickets?statusGroup=active'), c),
  },
  {
    name: 'GET /api/staff/tickets?statusGroup=active&requesterResolvedIndicator=true',
    expected: { anonymous: 401, mustChange: 403, owner: 403, otherRequester: 403, staff: 200, admin: 200 },
    call: async (c) => send(request(app).get('/api/staff/tickets?statusGroup=active&requesterResolvedIndicator=true'), c),
  },
  {
    name: 'GET /api/admin/users?isActive=false',
    expected: { anonymous: 401, mustChange: 403, owner: 403, otherRequester: 403, staff: 403, admin: 200 },
    call: async (c) => send(request(app).get('/api/admin/users?isActive=false'), c),
  },
];

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: `${PREFIX}-` } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.ticket.deleteMany({ where: { requesterId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await cleanup();
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id;
  await makeUser('mustChange', 'REQUESTER', true);
  await makeUser('owner', 'REQUESTER');
  await makeUser('otherRequester', 'REQUESTER');
  await makeUser('staff', 'IT_STAFF');
  await makeUser('admin', 'ADMINISTRATOR');
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('SEC-L4-01: authorization matrix for every new or changed Lab 4 route', () => {
  for (const route of ROUTES) {
    for (const persona of PERSONAS) {
      const expected = route.expected[persona];
      it(`${route.name} as ${persona} → ${expected}`, async () => {
        const res = await route.call(cookies[persona]);
        expect(res.status, JSON.stringify(res.body)).toBe(expected);
        if (expected >= 400) {
          // BR-28: the safe envelope only, and nothing about the Ticket the caller cannot see.
          expect(typeof res.body.error).toBe('string');
          for (const key of Object.keys(res.body)) expect(['error', 'message', 'fieldErrors', 'field']).toContain(key);
          expect(JSON.stringify(res.body)).not.toContain(SECRET_SUMMARY);
          expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|at .*\.ts/i);
        }
      });
    }
  }

  it('a must-change-password caller is told why (PASSWORD_CHANGE_REQUIRED), not just refused', async () => {
    const res = await request(app).get('/api/dashboard/requester').set('Cookie', cookies.mustChange!);
    expect(res.body.error).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('a wrong-owner Requester gets the same 404 as for a Ticket that does not exist', async () => {
    const ticket = await freshTicket();
    const theirs = await request(app).get(`/api/tickets/${ticket.id}/status-history`).set('Cookie', cookies.otherRequester!);
    const missing = await request(app).get('/api/tickets/999999999/status-history').set('Cookie', cookies.otherRequester!);
    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(missing.body);
  });
});
