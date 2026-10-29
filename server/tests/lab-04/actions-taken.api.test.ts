/**
 * server/tests/lab-04/actions-taken.api.test.ts
 *
 * Tests: API-L4-01..API-L4-12 (docs/lab-04/tests.md §3) — Actions Taken:
 * GET/POST /api/tickets/:id/actions, PATCH /api/tickets/:id/actions/:actionId, and the
 * BR-19 activity timestamp for actions, Public Comments and Internal Notes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const PREFIX = 'l4-actions-api';
const EMAILS = {
  owner: `${PREFIX}-owner@toktickit.com`,
  helper: `${PREFIX}-helper@toktickit.com`,
  admin: `${PREFIX}-admin@toktickit.com`,
  inactive: `${PREFIX}-inactive@toktickit.com`,
  requester: `${PREFIX}-requester@toktickit.com`,
  otherRequester: `${PREFIX}-other-requester@toktickit.com`,
};

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
type Fixture = { id: number; email: string; role: Role; cookie: string };

let owner: Fixture; // "Michael": owns the fixture tickets
let helper: Fixture; // "Alex": performs work on tickets he does not own (BR-02)
let admin: Fixture;
let inactive: Fixture;
let requester: Fixture;
let otherRequester: Fixture;
let categoryId: number;
let relatedSystemId: number;
const createdTicketIds: number[] = [];

const TICKET_CREATED_AT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

async function makeUser(key: keyof typeof EMAILS, role: Role, isActive = true): Promise<Fixture> {
  const email = EMAILS[key];
  const u = await prisma.user.upsert({
    where: { email },
    update: { role, isActive, mustChangePassword: false },
    create: { name: `Actions API ${key}`, email, passwordHash: 'x', role, isActive, mustChangePassword: false },
  });
  const token = signSessionToken({ userId: u.id, email, role, mustChangePassword: false });
  return { id: u.id, email, role, cookie: `toktickit_session=${token}` };
}

async function createTicket(
  status: 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'REOPENED' | 'RESOLVED' | 'CLOSED' | 'CANCELLED' = 'IN_PROGRESS',
) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1994-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId: requester.id,
      categoryId,
      relatedSystemId,
      summary: 'Actions Taken fixture ticket',
      description: 'Fixture ticket created for the Lab 4 Actions Taken API tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: status,
      ticketOwnerId: owner.id,
      createdAt: TICKET_CREATED_AT,
      updatedAt: TICKET_CREATED_AT,
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    clientRequestId: randomUUID(),
    description: 'Checked the Wi-Fi driver version.',
    ...overrides,
  };
}

function post(ticketId: number, as: Fixture, payload: Record<string, unknown>) {
  return request(app).post(`/api/tickets/${ticketId}/actions`).set(JSON_HEADERS).set('Cookie', as.cookie).send(payload);
}

function patch(ticketId: number, actionId: number, as: Fixture, payload: Record<string, unknown>) {
  return request(app)
    .patch(`/api/tickets/${ticketId}/actions/${actionId}`)
    .set(JSON_HEADERS)
    .set('Cookie', as.cookie)
    .send(payload);
}

function list(ticketId: number, as: Fixture) {
  return request(app).get(`/api/tickets/${ticketId}/actions`).set('Cookie', as.cookie);
}

async function actionCount(ticketId: number) {
  return prisma.actionTaken.count({ where: { ticketId } });
}

beforeAll(async () => {
  owner = await makeUser('owner', 'IT_STAFF');
  helper = await makeUser('helper', 'IT_STAFF');
  admin = await makeUser('admin', 'ADMINISTRATOR');
  inactive = await makeUser('inactive', 'IT_STAFF', false);
  requester = await makeUser('requester', 'REQUESTER');
  otherRequester = await makeUser('otherRequester', 'REQUESTER');
  categoryId = (await prisma.category.findFirst())!.id;
  relatedSystemId = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!.id;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.$disconnect();
});

describe('API-L4-01: create a valid Action Taken (AC-01, FR-01, FR-03)', () => {
  it('returns 201 under the ticket with server-set identity, default assignee and version 1', async () => {
    const ticket = await createTicket();
    const res = await post(ticket.id, owner, body({
      createdById: helper.id,
      performedById: helper.id,
      lastUpdatedById: helper.id,
      completedAt: '2020-01-01T00:00:00.000Z',
      version: 9,
      ticketId: 999999,
      attachmentNotes: '  See screenshot on this ticket. ',
    }));

    expect(res.status).toBe(201);
    const a = res.body.data;
    expect(a).toEqual(
      expect.objectContaining({
        ticketId: ticket.id,
        description: 'Checked the Wi-Fi driver version.',
        status: 'PLANNED',
        assignee: { id: owner.id, name: 'Actions API owner' },
        createdBy: { id: owner.id, name: 'Actions API owner' },
        lastUpdatedBy: { id: owner.id, name: 'Actions API owner' },
        performedBy: null,
        completedAt: null,
        result: null,
        followUpRequired: false,
        followUpNote: null,
        attachmentNotes: 'See screenshot on this ticket.',
        cancelReason: null,
        version: 1,
      }),
    );
    expect(Math.abs(new Date(a.actionAt).getTime() - Date.now())).toBeLessThan(60_000);
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.ticketId).toBe(ticket.id);
    expect(stored.createdById).toBe(owner.id);
  });

  it('lets an Administrator create an action assigned to another staff member', async () => {
    const ticket = await createTicket('NEW');
    const res = await post(ticket.id, admin, body({ assigneeId: helper.id }));
    expect(res.status).toBe(201);
    expect(res.body.data.assignee.id).toBe(helper.id);
    expect(res.body.data.createdBy.id).toBe(admin.id);
  });

  it('created already COMPLETED: performedBy and completedAt are the creator and creation time (BR-05)', async () => {
    const ticket = await createTicket();
    const res = await post(ticket.id, helper, body({ status: 'COMPLETED', result: 'Driver updated, Wi-Fi stable.' }));
    expect(res.status).toBe(201);
    expect(res.body.data.performedBy.id).toBe(helper.id);
    expect(Math.abs(new Date(res.body.data.completedAt).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('returns 404 for a missing ticket', async () => {
    const res = await post(99999999, owner, body());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('TICKET_NOT_FOUND');
  });
});

describe('API-L4-02: performer differs from owner (AC-02, BR-02)', () => {
  it('Alex completes an action on Michael\'s ticket; performedBy = Alex, owner unchanged', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body({ assigneeId: helper.id }));
    expect(created.status).toBe(201);

    const done = await patch(ticket.id, created.body.data.id, helper, {
      expectedVersion: 1,
      status: 'COMPLETED',
      result: 'Rolled the driver back; Wi-Fi stable.',
    });
    expect(done.status).toBe(200);
    expect(done.body.data.performedBy.id).toBe(helper.id);
    expect(done.body.data.createdBy.id).toBe(owner.id);

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.ticketOwnerId).toBe(owner.id);
    expect(after.currentStatus).toBe('IN_PROGRESS'); // BR-09: recording work never changes status
  });
});

describe('API-L4-03: validation failures (AC-03, BR-03, BR-04)', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['missing follow-up note', { followUpRequired: true }, 'followUpNote'],
    ['short description', { description: 'abc' }, 'description'],
    ['COMPLETED without result', { status: 'COMPLETED' }, 'result'],
    ['future actionAt', { actionAt: new Date(Date.now() + 60 * 60_000).toISOString() }, 'actionAt'],
    ['actionAt before ticket creation', { actionAt: new Date(TICKET_CREATED_AT.getTime() - 60_000).toISOString() }, 'actionAt'],
  ];

  it.each(cases)('create with %s gives 400 VALIDATION_FAILED and writes nothing', async (_label, overrides, field) => {
    const ticket = await createTicket();
    const res = await post(ticket.id, owner, body(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
    expect(res.body.fieldErrors).toHaveProperty(field);
    expect(await actionCount(ticket.id)).toBe(0);
  });

  it('create without a valid clientRequestId gives 400', async () => {
    const ticket = await createTicket();
    const res = await post(ticket.id, owner, body({ clientRequestId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty('clientRequestId');
    expect(await actionCount(ticket.id)).toBe(0);
  });

  it.each(cases)('update with %s gives 400 VALIDATION_FAILED and changes nothing', async (_label, overrides, field) => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    const { clientRequestId: _ignored, ...edit } = body(overrides);
    if (!('description' in overrides)) delete (edit as Record<string, unknown>).description;
    const res = await patch(ticket.id, created.body.data.id, owner, { expectedVersion: 1, ...edit });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
    expect(res.body.fieldErrors).toHaveProperty(field);
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(stored.version).toBe(1);
    expect(stored.status).toBe('PLANNED');
  });

  it('update with a key outside the editable list gives 400', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    const res = await patch(ticket.id, created.body.data.id, owner, { expectedVersion: 1, performedById: helper.id });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty('performedById');
  });
});

describe('API-L4-04: invalid assignee (AC-04, BR-06)', () => {
  it.each([
    ['an inactive staff member', () => inactive.id],
    ['a Requester', () => requester.id],
    ['an unknown id', () => 99999999],
    ['a non-integer', () => 'abc'],
  ])('create assigned to %s gives 400 INVALID_ASSIGNEE', async (_label, id) => {
    const ticket = await createTicket();
    const res = await post(ticket.id, owner, body({ assigneeId: id() }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ASSIGNEE');
    expect(res.body.fieldErrors).toHaveProperty('assigneeId');
    expect(await actionCount(ticket.id)).toBe(0);
  });

  it('reassigning to an inactive staff member gives 400 INVALID_ASSIGNEE', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    const res = await patch(ticket.id, created.body.data.id, owner, { expectedVersion: 1, assigneeId: inactive.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ASSIGNEE');
  });

  it('an action whose stored assignee is inactive must be reassigned before any other change', async () => {
    const ticket = await createTicket();
    const action = await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        clientRequestId: randomUUID(),
        actionAt: new Date(),
        description: 'Started by a staff member who has since left.',
        status: 'IN_PROGRESS',
        assigneeId: inactive.id,
        createdById: inactive.id,
        lastUpdatedById: inactive.id,
      },
    });

    const blocked = await patch(ticket.id, action.id, owner, { expectedVersion: 1, description: 'Picking this up again.' });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toBe('INVALID_ASSIGNEE');

    const ok = await patch(ticket.id, action.id, owner, {
      expectedVersion: 1,
      assigneeId: helper.id,
      description: 'Picking this up again.',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.assignee.id).toBe(helper.id);
  });
});

describe('API-L4-05: lifecycle PLANNED → IN_PROGRESS → COMPLETED (AC-05, FR-02)', () => {
  it('bumps version each time and sets performer and completion time on completion', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body({ assigneeId: helper.id }));
    const id = created.body.data.id;

    const started = await patch(ticket.id, id, helper, { expectedVersion: 1, status: 'IN_PROGRESS' });
    expect(started.status).toBe(200);
    expect(started.body.data).toEqual(
      expect.objectContaining({ status: 'IN_PROGRESS', version: 2, performedBy: null, completedAt: null }),
    );
    expect(started.body.data.lastUpdatedBy.id).toBe(helper.id);

    const done = await patch(ticket.id, id, owner, {
      expectedVersion: 2,
      status: 'COMPLETED',
      result: 'Battery replaced and tested.',
      followUpRequired: true,
      followUpNote: 'Check battery health in two weeks.',
    });
    expect(done.status).toBe(200);
    expect(done.body.data).toEqual(
      expect.objectContaining({
        status: 'COMPLETED',
        version: 3,
        result: 'Battery replaced and tested.',
        followUpRequired: true,
        followUpNote: 'Check battery health in two weeks.',
      }),
    );
    expect(done.body.data.performedBy.id).toBe(owner.id);
    expect(done.body.data.lastUpdatedBy.id).toBe(owner.id);
    expect(done.body.data.completedAt).not.toBeNull();
  });

  it('rejects a same-status or backwards transition with 400 INVALID_ACTION_TRANSITION', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body({ status: 'IN_PROGRESS' }));
    const same = await patch(ticket.id, created.body.data.id, owner, { expectedVersion: 1, status: 'IN_PROGRESS' });
    expect(same.status).toBe(400);
    expect(same.body.error).toBe('INVALID_ACTION_TRANSITION');
    const back = await patch(ticket.id, created.body.data.id, owner, { expectedVersion: 1, status: 'PLANNED' });
    expect(back.status).toBe(400);
    expect(back.body.error).toBe('INVALID_ACTION_TRANSITION');
  });

  it('rejects create with CANCELLED or an unknown status with 400 INVALID_ACTION_TRANSITION', async () => {
    const ticket = await createTicket();
    for (const status of ['CANCELLED', 'DONE']) {
      const res = await post(ticket.id, owner, body({ status, cancelReason: 'Not needed any more.' }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_ACTION_TRANSITION');
    }
    expect(await actionCount(ticket.id)).toBe(0);
  });
});

describe('API-L4-06: cancel and lock (AC-06, BR-07)', () => {
  it('cancel needs a reason; cancelled and completed actions are locked', async () => {
    const ticket = await createTicket();
    const planned = await post(ticket.id, owner, body());
    const id = planned.body.data.id;

    const noReason = await patch(ticket.id, id, owner, { expectedVersion: 1, status: 'CANCELLED' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.fieldErrors).toHaveProperty('cancelReason');

    const cancelled = await patch(ticket.id, id, owner, {
      expectedVersion: 1,
      status: 'CANCELLED',
      cancelReason: '  Duplicate of another action. ',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toEqual(
      expect.objectContaining({ status: 'CANCELLED', cancelReason: 'Duplicate of another action.', version: 2 }),
    );

    const lockedCancelled = await patch(ticket.id, id, owner, { expectedVersion: 2, description: 'Edited later on.' });
    expect(lockedCancelled.status).toBe(409);
    expect(lockedCancelled.body.error).toBe('ACTION_LOCKED');

    const completed = await post(ticket.id, owner, body({ status: 'COMPLETED', result: 'Done and verified.' }));
    // Locked wins over stale and invalid bodies (api-spec check order).
    const lockedCompleted = await patch(ticket.id, completed.body.data.id, owner, { expectedVersion: 99, description: 'x' });
    expect(lockedCompleted.status).toBe(409);
    expect(lockedCompleted.body.error).toBe('ACTION_LOCKED');
  });
});

describe('API-L4-07: stale action update (AC-07, BR-18)', () => {
  it('second writer with an old expectedVersion gets 409 STALE_UPDATE and the first change is kept', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    const id = created.body.data.id;
    await patch(ticket.id, id, owner, { expectedVersion: 1, status: 'IN_PROGRESS' }); // now version 2

    const first = await patch(ticket.id, id, owner, { expectedVersion: 2, description: 'First writer description.' });
    expect(first.status).toBe(200);
    expect(first.body.data.version).toBe(3);

    const second = await patch(ticket.id, id, helper, { expectedVersion: 2, description: 'Second writer description.' });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: 'STALE_UPDATE',
      message: 'This record was changed by someone else. Reload to see the latest version.',
      currentVersion: 3,
    });

    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id } });
    expect(stored.description).toBe('First writer description.');
    expect(stored.version).toBe(3);
  });

  it('a missing or non-integer expectedVersion gives 400', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    for (const payload of [{ description: 'No version sent.' }, { expectedVersion: '1', description: 'String version.' }]) {
      const res = await patch(ticket.id, created.body.data.id, owner, payload);
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors).toHaveProperty('expectedVersion');
    }
  });

  it('concurrent updates with the same expectedVersion: exactly one wins', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    const id = created.body.data.id;
    const results = await Promise.all([
      patch(ticket.id, id, owner, { expectedVersion: 1, description: 'Concurrent writer A.' }),
      patch(ticket.id, id, helper, { expectedVersion: 1, description: 'Concurrent writer B.' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id } });
    expect(stored.version).toBe(2);
  });
});

describe('API-L4-08: Requester access (AC-08, BR-10)', () => {
  it('Requester POST and PATCH give 403 even on their own ticket', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    const p = await post(ticket.id, requester, body());
    expect(p.status).toBe(403);
    expect(p.body.error).toBe('FORBIDDEN_ROLE');
    const u = await patch(ticket.id, created.body.data.id, requester, { expectedVersion: 1, description: 'Requester edit.' });
    expect(u.status).toBe(403);
    expect(await actionCount(ticket.id)).toBe(1);
  });

  it('GET on another Requester\'s ticket gives 404; own ticket gives every field of every action', async () => {
    const ticket = await createTicket();
    await post(ticket.id, owner, body({ followUpRequired: true, followUpNote: 'Ask the requester tomorrow.' }));
    await post(ticket.id, helper, body({ status: 'COMPLETED', result: 'Reinstalled the VPN client.' }));

    const other = await list(ticket.id, otherRequester);
    expect(other.status).toBe(404);
    expect(other.body.error).toBe('TICKET_NOT_FOUND');

    const own = await list(ticket.id, requester);
    expect(own.status).toBe(200);
    expect(own.body.data).toHaveLength(2);
    const staffView = await list(ticket.id, owner);
    expect(own.body).toEqual(staffView.body);
    expect(own.body.data[0]).toHaveProperty('followUpNote', 'Ask the requester tomorrow.');
    expect(own.body.meta).toEqual({ totalCount: 2, openCount: 1, completedCount: 1 });
  });

  it('GET on a ticket with no actions returns an empty list with zero counts', async () => {
    const ticket = await createTicket();
    const res = await list(ticket.id, owner);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], meta: { totalCount: 0, openCount: 0, completedCount: 0 } });
  });

  it('unauthenticated requests get 401', async () => {
    const ticket = await createTicket();
    expect((await request(app).get(`/api/tickets/${ticket.id}/actions`)).status).toBe(401);
  });
});

describe('API-L4-09: terminal ticket is read-only (AC-09, BR-09)', () => {
  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'] as const)('create or PATCH on a %s ticket gives 409 TICKET_NOT_WRITABLE', async (status) => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: status } });

    const c = await post(ticket.id, owner, body());
    expect(c.status).toBe(409);
    expect(c.body.error).toBe('TICKET_NOT_WRITABLE');
    const u = await patch(ticket.id, created.body.data.id, owner, { expectedVersion: 1, description: 'Too late now.' });
    expect(u.status).toBe(409);
    expect(u.body.error).toBe('TICKET_NOT_WRITABLE');
    expect(await actionCount(ticket.id)).toBe(1);
  });

  it.each(['NEW', 'OPEN', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const)('a %s ticket accepts actions', async (status) => {
    const ticket = await createTicket(status);
    expect((await post(ticket.id, owner, body())).status).toBe(201);
  });
});

describe('API-L4-10: ordering and idempotent create (AC-10, BR-11, BR-20)', () => {
  it('GET is ordered by actionAt ASC, id ASC and stable after edits', async () => {
    const ticket = await createTicket();
    const t = (h: number) => new Date(TICKET_CREATED_AT.getTime() + h * 60 * 60_000).toISOString();
    const late = await post(ticket.id, owner, body({ actionAt: t(5), description: 'Late action entry.' }));
    const early = await post(ticket.id, owner, body({ actionAt: t(1), description: 'Early action entry.' }));
    const tieA = await post(ticket.id, owner, body({ actionAt: t(3), description: 'Tie action A entry.' }));
    const tieB = await post(ticket.id, owner, body({ actionAt: t(3), description: 'Tie action B entry.' }));
    const expected = [early, tieA, tieB, late].map((r) => r.body.data.id);

    expect((await list(ticket.id, owner)).body.data.map((a: { id: number }) => a.id)).toEqual(expected);
    await patch(ticket.id, early.body.data.id, owner, { expectedVersion: 1, description: 'Early action, edited.' });
    expect((await list(ticket.id, owner)).body.data.map((a: { id: number }) => a.id)).toEqual(expected);
  });

  it('the same clientRequestId twice gives 201 then 200 with one row', async () => {
    const ticket = await createTicket();
    const payload = body();
    const first = await post(ticket.id, owner, payload);
    const second = await post(ticket.id, owner, { ...payload, description: 'A different description on retry.' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
    expect(await actionCount(ticket.id)).toBe(1);
  });

  it('concurrent retries with the same clientRequestId still create one row', async () => {
    const ticket = await createTicket();
    const payload = body();
    const results = await Promise.all([post(ticket.id, owner, payload), post(ticket.id, owner, payload)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await actionCount(ticket.id)).toBe(1);
  });

  it('the same clientRequestId on a different ticket is a different action', async () => {
    const a = await createTicket();
    const b = await createTicket();
    const payload = body();
    expect((await post(a.id, owner, payload)).status).toBe(201);
    expect((await post(b.id, owner, payload)).status).toBe(201);
  });
});

describe('API-L4-11: no delete (BR-08)', () => {
  it('DELETE /api/tickets/:id/actions/:actionId gives 404 and the row stays', async () => {
    const ticket = await createTicket();
    const created = await post(ticket.id, owner, body());
    const res = await request(app)
      .delete(`/api/tickets/${ticket.id}/actions/${created.body.data.id}`)
      .set(JSON_HEADERS)
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(404);
    expect(await actionCount(ticket.id)).toBe(1);
  });

  it('PATCH on an action of another ticket gives 404 ACTION_NOT_FOUND', async () => {
    const a = await createTicket();
    const b = await createTicket();
    const created = await post(a.id, owner, body());
    const res = await patch(b.id, created.body.data.id, owner, { expectedVersion: 1, description: 'Wrong ticket path.' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ACTION_NOT_FOUND');
  });
});

describe('API-L4-12: activity timestamp (BR-19)', () => {
  async function ticketState(id: number) {
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id }, select: { updatedAt: true, version: true } });
    return { updatedAt: t.updatedAt.getTime(), version: t.version };
  }

  it('action create and update, and a Public Comment, touch updatedAt but not version', async () => {
    const ticket = await createTicket();
    const start = await ticketState(ticket.id);

    const created = await post(ticket.id, owner, body());
    const afterCreate = await ticketState(ticket.id);
    expect(afterCreate.updatedAt).toBeGreaterThan(start.updatedAt);
    expect(afterCreate.version).toBe(start.version);

    await prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: TICKET_CREATED_AT } });
    await patch(ticket.id, created.body.data.id, owner, { expectedVersion: 1, status: 'IN_PROGRESS' });
    const afterUpdate = await ticketState(ticket.id);
    expect(afterUpdate.updatedAt).toBeGreaterThan(TICKET_CREATED_AT.getTime());
    expect(afterUpdate.version).toBe(start.version);

    await prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: TICKET_CREATED_AT } });
    const comment = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set(JSON_HEADERS)
      .set('Cookie', requester.cookie)
      .send({ content: 'Thanks, it works now.' });
    expect(comment.status).toBe(201);
    const afterComment = await ticketState(ticket.id);
    expect(afterComment.updatedAt).toBeGreaterThan(TICKET_CREATED_AT.getTime());
    expect(afterComment.version).toBe(start.version);
  });

  it('an Internal Note changes neither updatedAt nor version', async () => {
    const ticket = await createTicket();
    const start = await ticketState(ticket.id);
    const note = await request(app)
      .post(`/api/tickets/${ticket.id}/notes`)
      .set(JSON_HEADERS)
      .set('Cookie', owner.cookie)
      .send({ content: 'Requester sounded frustrated on the phone.' });
    expect(note.status).toBe(201);
    expect(await ticketState(ticket.id)).toEqual(start);
  });

  it('a rejected action write leaves updatedAt alone', async () => {
    const ticket = await createTicket();
    const start = await ticketState(ticket.id);
    await post(ticket.id, owner, body({ description: 'no' }));
    expect(await ticketState(ticket.id)).toEqual(start);
  });
});
