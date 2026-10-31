/**
 * server/tests/lab-04/ticket-workflow.api.test.ts
 *
 * Tests: API-L4-13..API-L4-20 (docs/lab-04/tests.md §2.3) — final transition matrix, resolution
 * gate, advisory Requester signal, append-only status history, optimistic concurrency on Ticket
 * mutations, cancel side effects, detail payload, reopen/close details.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const PREFIX = 'l4-workflow-api';
const EMAILS = {
  owner: `${PREFIX}-owner@toktickit.com`,
  helper: `${PREFIX}-helper@toktickit.com`,
  admin: `${PREFIX}-admin@toktickit.com`,
  inactive: `${PREFIX}-inactive@toktickit.com`,
  requester: `${PREFIX}-requester@toktickit.com`,
  otherRequester: `${PREFIX}-other-requester@toktickit.com`,
};

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';
type Fixture = { id: number; email: string; name: string; role: Role; cookie: string };

let owner: Fixture;
let helper: Fixture;
let admin: Fixture;
let inactive: Fixture;
let requester: Fixture;
let otherRequester: Fixture;
let categoryId: number;
let relatedSystemId: number;
const createdTicketIds: number[] = [];

async function makeUser(key: keyof typeof EMAILS, role: Role, isActive = true): Promise<Fixture> {
  const email = EMAILS[key];
  const name = `Workflow API ${key}`;
  const u = await prisma.user.upsert({
    where: { email },
    update: { role, isActive, mustChangePassword: false, name },
    create: { name, email, passwordHash: 'x', role, isActive, mustChangePassword: false },
  });
  const token = signSessionToken({ userId: u.id, email, role, mustChangePassword: false });
  return { id: u.id, email, name, role, cookie: `toktickit_session=${token}` };
}

async function createTicket(
  status: Status,
  opts: { ownerId?: number | null; actions?: Array<'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>; indicator?: boolean } = {},
) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1996-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId: requester.id,
      categoryId,
      relatedSystemId,
      summary: 'Workflow fixture ticket',
      description: 'Fixture ticket created for the Lab 4 workflow API tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: status,
      ticketOwnerId: opts.ownerId === undefined ? owner.id : opts.ownerId,
      requesterResolvedIndicator: opts.indicator ?? false,
      resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date() : null,
    },
  });
  createdTicketIds.push(ticket.id);
  for (const actionStatus of opts.actions ?? []) {
    await prisma.actionTaken.create({
      data: {
        ticketId: ticket.id,
        clientRequestId: randomUUID(),
        actionAt: new Date(),
        description: `Fixture ${actionStatus} action`,
        status: actionStatus,
        result: actionStatus === 'COMPLETED' ? 'Fixture result text.' : null,
        assigneeId: owner.id,
        createdById: owner.id,
        lastUpdatedById: owner.id,
        performedById: actionStatus === 'COMPLETED' ? owner.id : null,
        completedAt: actionStatus === 'COMPLETED' ? new Date() : null,
      },
    });
  }
  return ticket;
}

function patchStatus(ticketId: number, as: Fixture, body: Record<string, unknown>) {
  return request(app)
    .patch(`/api/staff/tickets/${ticketId}/status`)
    .set(JSON_HEADERS)
    .set('Cookie', as.cookie)
    .send(body);
}

function patchAs(path: string, as: Fixture, body: Record<string, unknown> = {}) {
  return request(app).patch(path).set(JSON_HEADERS).set('Cookie', as.cookie).send(body);
}

function history(ticketId: number, as: Fixture) {
  return request(app).get(`/api/tickets/${ticketId}/status-history`).set('Cookie', as.cookie);
}

async function stored(ticketId: number) {
  return prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
}

async function historyCount(ticketId: number) {
  return prisma.ticketStatusChange.count({ where: { ticketId } });
}

/** The extra fields a permitted transition needs (BR-13 "Required input"). */
function bodyFor(from: Status, to: Status): Record<string, unknown> {
  if (to === 'RESOLVED') return { status: to, resolutionSummary: 'Fixed and verified with the requester.' };
  if (from === 'RESOLVED' && to === 'REOPENED') return { status: to, reopenReason: 'The problem came back overnight.' };
  return { status: to };
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

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.$disconnect();
});

describe('API-L4-13: final transition matrix (AC-11, BR-13)', () => {
  const permitted: Array<[Status, Status]> = [
    ['NEW', 'OPEN'], ['NEW', 'IN_PROGRESS'], ['NEW', 'CANCELLED'],
    ['OPEN', 'IN_PROGRESS'], ['OPEN', 'WAITING_FOR_REQUESTER'], ['OPEN', 'CANCELLED'],
    ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'], ['IN_PROGRESS', 'RESOLVED'], ['IN_PROGRESS', 'CANCELLED'],
    ['WAITING_FOR_REQUESTER', 'IN_PROGRESS'], ['WAITING_FOR_REQUESTER', 'RESOLVED'], ['WAITING_FOR_REQUESTER', 'CANCELLED'],
    ['RESOLVED', 'CLOSED'], ['RESOLVED', 'REOPENED'],
    ['REOPENED', 'IN_PROGRESS'], ['REOPENED', 'WAITING_FOR_REQUESTER'], ['REOPENED', 'RESOLVED'], ['REOPENED', 'CANCELLED'],
  ];

  it.each(permitted)('Staff %s → %s gives 200 and writes one history row', async (from, to) => {
    const ticket = await createTicket(from, { actions: ['COMPLETED'] });
    const before = await historyCount(ticket.id);
    const res = await patchStatus(ticket.id, owner, bodyFor(from, to));
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe(to);
    expect((await stored(ticket.id)).currentStatus).toBe(to);
    expect(await historyCount(ticket.id)).toBe(before + 1);
  });

  it('an Administrator may use the staff matrix too', async () => {
    const ticket = await createTicket('NEW');
    expect((await patchStatus(ticket.id, admin, { status: 'OPEN' })).status).toBe(200);
  });

  it('the owning Requester may cancel a NEW ticket (the Requester row)', async () => {
    const ticket = await createTicket('NEW', { ownerId: null });
    const res = await patchAs(`/api/tickets/${ticket.id}/cancel`, requester, { cancellationReason: 'Raised by mistake.' });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe('CANCELLED');
  });

  it.each([
    ['NEW', 'RESOLVED'], ['NEW', 'CLOSED'], ['NEW', 'REOPENED'], ['OPEN', 'RESOLVED'], ['IN_PROGRESS', 'NEW'],
    ['IN_PROGRESS', 'CLOSED'], ['RESOLVED', 'IN_PROGRESS'], ['RESOLVED', 'CANCELLED'], ['REOPENED', 'CLOSED'],
    ['CLOSED', 'REOPENED'], ['CANCELLED', 'OPEN'], ['WAITING_FOR_REQUESTER', 'WAITING_FOR_REQUESTER'],
  ] as Array<[Status, Status]>)('Staff %s → %s gives 400 INVALID_STATUS_TRANSITION and changes nothing', async (from, to) => {
    const ticket = await createTicket(from, { actions: ['COMPLETED'] });
    const res = await patchStatus(ticket.id, owner, bodyFor(from, to));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_STATUS_TRANSITION');
    const after = await stored(ticket.id);
    expect(after.currentStatus).toBe(from);
    expect(after.version).toBe(ticket.version);
  });

  it('a Requester on the staff status route gets 403; on a non-NEW own ticket the cancel route refuses', async () => {
    const ticket = await createTicket('OPEN');
    expect((await patchStatus(ticket.id, requester, { status: 'CANCELLED' })).status).toBe(403);
    const res = await patchAs(`/api/tickets/${ticket.id}/cancel`, requester, { cancellationReason: 'Changed my mind.' });
    expect(res.status).toBe(400);
    expect((await stored(ticket.id)).currentStatus).toBe('OPEN');
  });
});

describe('API-L4-14: resolution gate on a direct API call (AC-12, BR-14)', () => {
  const summary = { status: 'RESOLVED', resolutionSummary: 'Replaced the battery and verified.' };

  it.each([
    ['no owner', { ownerId: null, actions: ['COMPLETED'] }, ['HAS_OWNER']],
    ['no completed action', { actions: ['CANCELLED'] }, ['HAS_COMPLETED_ACTION']],
    ['an open PLANNED action', { actions: ['COMPLETED', 'PLANNED'] }, ['NO_OPEN_ACTIONS']],
    ['an open IN_PROGRESS action', { actions: ['COMPLETED', 'IN_PROGRESS'] }, ['NO_OPEN_ACTIONS']],
    ['everything unmet', { ownerId: null, actions: ['PLANNED'] }, ['HAS_OWNER', 'HAS_COMPLETED_ACTION', 'NO_OPEN_ACTIONS']],
  ] as const)('%s gives 409 RESOLUTION_GATE_NOT_MET and leaves the ticket unchanged', async (_label, opts, keys) => {
    const ticket = await createTicket('IN_PROGRESS', { ...opts, actions: [...opts.actions] });
    const res = await patchStatus(ticket.id, owner, summary);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RESOLUTION_GATE_NOT_MET');
    expect(res.body.unmetConditions.map((c: { key: string }) => c.key)).toEqual(keys);
    expect(res.body.unmetConditions[0]).toHaveProperty('label');
    const after = await stored(ticket.id);
    expect(after.currentStatus).toBe('IN_PROGRESS');
    expect(after.version).toBe(ticket.version);
    expect(after.resolvedAt).toBeNull();
    expect(await historyCount(ticket.id)).toBe(0);
  });

  it('an inactive owner does not satisfy the gate', async () => {
    const ticket = await createTicket('IN_PROGRESS', { ownerId: inactive.id, actions: ['COMPLETED'] });
    const res = await patchStatus(ticket.id, owner, summary);
    expect(res.status).toBe(409);
    expect(res.body.unmetConditions.map((c: { key: string }) => c.key)).toEqual(['HAS_OWNER']);
  });

  it('a missing or short summary gives 400 VALIDATION_FAILED', async () => {
    const ticket = await createTicket('IN_PROGRESS', { actions: ['COMPLETED'] });
    for (const body of [{ status: 'RESOLVED' }, { status: 'RESOLVED', resolutionSummary: 'ok' }]) {
      const res = await patchStatus(ticket.id, owner, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_FAILED');
      expect(res.body.fieldErrors).toHaveProperty('resolutionSummary');
    }
  });

  it('when every condition holds: 200, resolvedAt set, indicator cleared, version + 1, history note = summary', async () => {
    const ticket = await createTicket('WAITING_FOR_REQUESTER', { actions: ['COMPLETED', 'CANCELLED'], indicator: true });
    const res = await patchStatus(ticket.id, helper, summary);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        currentStatus: 'RESOLVED',
        resolutionSummary: 'Replaced the battery and verified.',
        requesterResolvedIndicator: false,
        version: ticket.version + 1,
        permittedNextStatuses: ['CLOSED', 'REOPENED'],
      }),
    );
    expect(res.body.resolvedAt).not.toBeNull();
    const rows = await prisma.ticketStatusChange.findMany({ where: { ticketId: ticket.id } });
    expect(rows).toEqual([
      expect.objectContaining({
        fromStatus: 'WAITING_FOR_REQUESTER',
        toStatus: 'RESOLVED',
        changedById: helper.id,
        note: 'Replaced the battery and verified.',
        isMigrated: false,
      }),
    ]);
  });
});

describe('API-L4-15: advisory Requester signal (AC-13, BR-16)', () => {
  it('resolve-indicator leaves the status unchanged, bumps version, and is cleared on RESOLVED', async () => {
    const ticket = await createTicket('IN_PROGRESS', { actions: ['COMPLETED'] });
    const res = await patchAs(`/api/tickets/${ticket.id}/resolve-indicator`, requester);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(ticket.version + 1);
    const after = await stored(ticket.id);
    expect(after.currentStatus).toBe('IN_PROGRESS');
    expect(after.requesterResolvedIndicator).toBe(true);
    expect(await historyCount(ticket.id)).toBe(0); // not a status change

    await patchStatus(ticket.id, owner, { status: 'RESOLVED', resolutionSummary: 'Confirmed with the requester.' });
    expect((await stored(ticket.id)).requesterResolvedIndicator).toBe(false);
  });
});

describe('API-L4-16: append-only status history (AC-14, BR-17, FR-09)', () => {
  it('the 6-step journey gives 6 rows oldest first with actor and note', async () => {
    const ticket = await createTicket('NEW', { actions: ['COMPLETED'] });
    const steps: Array<[Fixture, Record<string, unknown>]> = [
      [owner, { status: 'IN_PROGRESS' }],
      [owner, { status: 'RESOLVED', resolutionSummary: 'First fix: reseated the RAM.' }],
      [helper, { status: 'REOPENED', reopenReason: 'Laptop crashed again this morning.' }],
      [helper, { status: 'IN_PROGRESS', note: 'Taking over from the owner.' }],
      [owner, { status: 'RESOLVED', resolutionSummary: 'Replaced the RAM module.' }],
      [admin, { status: 'CLOSED' }],
    ];
    for (const [as, body] of steps) {
      const res = await patchStatus(ticket.id, as, body);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }

    const res = await history(ticket.id, owner);
    expect(res.status).toBe(200);
    expect(res.body.data.map((h: { fromStatus: string; toStatus: string }) => `${h.fromStatus}>${h.toStatus}`)).toEqual([
      'NEW>IN_PROGRESS',
      'IN_PROGRESS>RESOLVED',
      'RESOLVED>REOPENED',
      'REOPENED>IN_PROGRESS',
      'IN_PROGRESS>RESOLVED',
      'RESOLVED>CLOSED',
    ]);
    expect(res.body.data.map((h: { changedBy: { name: string } }) => h.changedBy.name)).toEqual([
      owner.name, owner.name, helper.name, helper.name, owner.name, admin.name,
    ]);
    expect(res.body.data.map((h: { note: string | null }) => h.note)).toEqual([
      null,
      'First fix: reseated the RAM.',
      'Laptop crashed again this morning.',
      'Taking over from the owner.',
      'Replaced the RAM module.',
      null,
    ]);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ id: expect.any(Number), isMigrated: false, createdAt: expect.any(String) }),
    );
    const times = res.body.data.map((h: { createdAt: string }) => new Date(h.createdAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('has no write routes, and is visible to the owning Requester only', async () => {
    const ticket = await createTicket('NEW');
    await patchStatus(ticket.id, owner, { status: 'OPEN' });
    for (const method of ['post', 'patch', 'delete'] as const) {
      const res = await request(app)[method](`/api/tickets/${ticket.id}/status-history`).set(JSON_HEADERS).set('Cookie', admin.cookie);
      expect(res.status).toBe(404);
    }
    expect((await history(ticket.id, requester)).body.data).toHaveLength(1);
    const other = await history(ticket.id, otherRequester);
    expect(other.status).toBe(404);
    expect(other.body.error).toBe('TICKET_NOT_FOUND');
    expect((await history(99999999, owner)).status).toBe(404);
  });
});

describe('API-L4-17: stale Ticket mutation (AC-15, BR-18)', () => {
  it('AC-15: status changed by one user, then an owner change with the old version gives 409', async () => {
    const ticket = await createTicket('OPEN');
    const v = ticket.version;
    expect((await patchStatus(ticket.id, owner, { status: 'IN_PROGRESS', expectedVersion: v })).status).toBe(200);

    const res = await patchAs(`/api/staff/tickets/${ticket.id}/owner`, helper, { ticketOwnerId: helper.id, expectedVersion: v });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({ error: 'STALE_UPDATE', currentVersion: v + 1 }));
    expect((await stored(ticket.id)).ticketOwnerId).toBe(owner.id);
  });

  it.each([
    ['owner', (id: number) => `/api/staff/tickets/${id}/owner`, () => ({ ticketOwnerId: helper.id })],
    ['priority', (id: number) => `/api/staff/tickets/${id}/priority`, () => ({ itPriority: 'HIGH' })],
    ['status', (id: number) => `/api/staff/tickets/${id}/status`, () => ({ status: 'WAITING_FOR_REQUESTER' })],
  ] as const)('%s with an old expectedVersion gives 409 and nothing changes', async (_label, path, body) => {
    const ticket = await createTicket('IN_PROGRESS');
    await prisma.ticket.update({ where: { id: ticket.id }, data: { version: 4 } });
    const res = await patchAs(path(ticket.id), owner, { ...body(), expectedVersion: 3 });
    expect(res.status).toBe(409);
    expect(res.body.currentVersion).toBe(4);
    const after = await stored(ticket.id);
    expect(after.version).toBe(4);
    expect(after.ticketOwnerId).toBe(owner.id);
    expect(after.itPriority).toBe('MEDIUM');
    expect(after.currentStatus).toBe('IN_PROGRESS');
  });

  it('Requester resolve-indicator and cancel honour expectedVersion too', async () => {
    const working = await createTicket('IN_PROGRESS');
    const stale = await patchAs(`/api/tickets/${working.id}/resolve-indicator`, requester, { expectedVersion: working.version + 5 });
    expect(stale.status).toBe(409);
    expect((await stored(working.id)).requesterResolvedIndicator).toBe(false);

    const fresh = await createTicket('NEW', { ownerId: null });
    const staleCancel = await patchAs(`/api/tickets/${fresh.id}/cancel`, requester, { expectedVersion: 99 });
    expect(staleCancel.status).toBe(409);
    expect((await stored(fresh.id)).currentStatus).toBe('NEW');
  });

  it('without expectedVersion the Lab 3 behaviour is unchanged and version still increments', async () => {
    const ticket = await createTicket('OPEN');
    const ownerRes = await patchAs(`/api/staff/tickets/${ticket.id}/owner`, owner, { ticketOwnerId: helper.id });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body).toEqual(expect.objectContaining({ ticketOwnerId: helper.id, version: ticket.version + 1 }));
    const priorityRes = await patchAs(`/api/staff/tickets/${ticket.id}/priority`, owner, { itPriority: 'LOW' });
    expect(priorityRes.body).toEqual(expect.objectContaining({ itPriority: 'LOW', version: ticket.version + 2 }));
    expect((await patchStatus(ticket.id, owner, { status: 'IN_PROGRESS' })).body.version).toBe(ticket.version + 3);
  });

  it('a non-integer expectedVersion gives 400', async () => {
    const ticket = await createTicket('OPEN');
    const res = await patchStatus(ticket.id, owner, { status: 'IN_PROGRESS', expectedVersion: '1' });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty('expectedVersion');
  });

  it('concurrent status changes at the same version: exactly one wins', async () => {
    const ticket = await createTicket('OPEN');
    const results = await Promise.all([
      patchStatus(ticket.id, owner, { status: 'IN_PROGRESS', expectedVersion: ticket.version }),
      patchStatus(ticket.id, helper, { status: 'WAITING_FOR_REQUESTER', expectedVersion: ticket.version }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await historyCount(ticket.id)).toBe(1);
  });
});

describe('API-L4-18: cancel side effects (AC-16, BR-15)', () => {
  async function actionsOf(ticketId: number) {
    return prisma.actionTaken.findMany({ where: { ticketId }, orderBy: { id: 'asc' } });
  }

  it('Staff cancel auto-cancels open actions with "Ticket cancelled" and leaves completed ones', async () => {
    const ticket = await createTicket('IN_PROGRESS', { actions: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'], indicator: true });
    const res = await patchStatus(ticket.id, helper, { status: 'CANCELLED', note: 'Requester left the university.' });
    expect(res.status).toBe(200);
    expect(res.body.requesterResolvedIndicator).toBe(false);

    const actions = await actionsOf(ticket.id);
    expect(actions.map((a) => a.status)).toEqual(['CANCELLED', 'CANCELLED', 'COMPLETED']);
    for (const a of actions.slice(0, 2)) {
      expect(a.cancelReason).toBe('Ticket cancelled');
      expect(a.lastUpdatedById).toBe(helper.id);
      expect(a.version).toBe(2);
    }
    expect(actions[2].cancelReason).toBeNull();
    const rows = await prisma.ticketStatusChange.findMany({ where: { ticketId: ticket.id } });
    expect(rows).toEqual([expect.objectContaining({ toStatus: 'CANCELLED', note: 'Requester left the university.' })]);
  });

  // D-16 (PR #69 review): a Requester never changes Actions Taken (handout §4.3, AC-08), so a
  // Requester cancel is refused while staff work is still open, instead of auto-cancelling it.
  it('Requester NEW → CANCELLED with an open action gives 409 TICKET_HAS_OPEN_ACTIONS and changes nothing', async () => {
    const ticket = await createTicket('NEW', { actions: ['PLANNED'] });
    const res = await patchAs(`/api/tickets/${ticket.id}/cancel`, requester, { cancellationReason: 'Fixed it myself.' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TICKET_HAS_OPEN_ACTIONS');
    expect(res.body.message).toBeTruthy();
    const after = await stored(ticket.id);
    expect(after.currentStatus).toBe('NEW');
    expect(after.version).toBe(ticket.version);
    expect((await actionsOf(ticket.id))[0]).toEqual(
      expect.objectContaining({ status: 'PLANNED', cancelReason: null, lastUpdatedById: owner.id, version: 1 }),
    );
    expect(await historyCount(ticket.id)).toBe(0);
  });

  it('Requester NEW → CANCELLED with only closed actions succeeds, leaves them untouched, and writes a history row', async () => {
    const ticket = await createTicket('NEW', { actions: ['COMPLETED', 'CANCELLED'] });
    const res = await patchAs(`/api/tickets/${ticket.id}/cancel`, requester, { cancellationReason: 'Fixed it myself.' });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(ticket.version + 1);
    for (const a of await actionsOf(ticket.id)) {
      expect(a.lastUpdatedById).toBe(owner.id);
      expect(a.version).toBe(1);
    }
    const rows = await prisma.ticketStatusChange.findMany({ where: { ticketId: ticket.id } });
    expect(rows).toEqual([
      expect.objectContaining({ fromStatus: 'NEW', toStatus: 'CANCELLED', changedById: requester.id, note: 'Fixed it myself.' }),
    ]);
  });

  it('a failure inside the transaction leaves the ticket, its actions and its history unchanged', async () => {
    const ticket = await createTicket('IN_PROGRESS', { actions: ['PLANNED'] });
    const original = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>) =>
      original(async (tx) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              if (prop === 'ticketStatusChange') {
                return { create: () => Promise.reject(new Error('forced failure for API-L4-18')) };
              }
              // Everything else is the real transaction client, so the ticket update and the
              // action auto-cancel really run before the forced failure.
              const value = Reflect.get(target, prop);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }),
        ),
      )) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await patchStatus(ticket.id, owner, { status: 'CANCELLED' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'INTERNAL_ERROR' });
    const after = await stored(ticket.id);
    expect(after.currentStatus).toBe('IN_PROGRESS');
    expect(after.version).toBe(ticket.version);
    expect((await actionsOf(ticket.id))[0].status).toBe('PLANNED');
    expect(await historyCount(ticket.id)).toBe(0);
  });
});

describe('API-L4-19: detail payload (AC-17, FR-11)', () => {
  it('staff detail has version, permittedNextStatuses and resolutionGate', async () => {
    const ticket = await createTicket('IN_PROGRESS', { actions: ['COMPLETED', 'PLANNED'] });
    await prisma.actionTaken.updateMany({ where: { ticketId: ticket.id, status: 'COMPLETED' }, data: { followUpRequired: true, followUpNote: 'Check in a week.' } });
    const res = await request(app).get(`/api/staff/tickets/${ticket.id}`).set('Cookie', owner.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        version: ticket.version,
        resolvedAt: null,
        permittedNextStatuses: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
        resolutionGate: {
          met: false,
          conditions: [
            { key: 'HAS_OWNER', met: true, label: 'Ticket has an owner' },
            { key: 'HAS_COMPLETED_ACTION', met: true, label: 'At least one action is completed' },
            { key: 'NO_OPEN_ACTIONS', met: false, label: 'No planned or in-progress actions remain' },
          ],
          warnings: ['1 completed action requires follow-up'],
        },
      }),
    );
  });

  it('Requester detail has no resolutionGate, and permits CANCELLED only while NEW', async () => {
    const fresh = await createTicket('NEW', { ownerId: null });
    const working = await createTicket('IN_PROGRESS');
    const a = await request(app).get(`/api/tickets/${fresh.id}`).set('Cookie', requester.cookie);
    const b = await request(app).get(`/api/tickets/${working.id}`).set('Cookie', requester.cookie);
    expect(a.body.permittedNextStatuses).toEqual(['CANCELLED']);
    expect(b.body.permittedNextStatuses).toEqual([]);
    expect(a.body.version).toBe(fresh.version);
    expect(a.body).toHaveProperty('resolvedAt', null);
    expect(a.body).not.toHaveProperty('resolutionGate');
  });

  it('Requester detail does not offer CANCELLED on a NEW ticket with open staff work (D-16)', async () => {
    const worked = await createTicket('NEW', { actions: ['IN_PROGRESS'] });
    const res = await request(app).get(`/api/tickets/${worked.id}`).set('Cookie', requester.cookie);
    expect(res.body.permittedNextStatuses).toEqual([]);
  });
});

describe('API-L4-20: reopen and close details (BR-13, BR-15)', () => {
  it('RESOLVED → REOPENED needs a reason and clears resolvedAt', async () => {
    const ticket = await createTicket('RESOLVED');
    expect((await patchStatus(ticket.id, owner, { status: 'REOPENED' })).status).toBe(400);
    const res = await patchStatus(ticket.id, owner, { status: 'REOPENED', reopenReason: 'Still broken after the fix.' });
    expect(res.status).toBe(200);
    expect(res.body.resolvedAt).toBeNull();
    expect(res.body.reopenReason).toBe('Still broken after the fix.');
  });

  it('RESOLVED → CLOSED without a summary keeps the stored summary and resolvedAt', async () => {
    const ticket = await createTicket('RESOLVED');
    await prisma.ticket.update({ where: { id: ticket.id }, data: { resolutionSummary: 'Original summary text.' } });
    const before = await stored(ticket.id);
    const res = await patchStatus(ticket.id, owner, { status: 'CLOSED' });
    expect(res.status).toBe(200);
    const after = await stored(ticket.id);
    expect(after.resolutionSummary).toBe('Original summary text.');
    expect(after.resolvedAt?.getTime()).toBe(before.resolvedAt?.getTime());
  });

  it('REOPENED → WAITING_FOR_REQUESTER gives 200', async () => {
    const ticket = await createTicket('REOPENED');
    expect((await patchStatus(ticket.id, owner, { status: 'WAITING_FOR_REQUESTER' })).status).toBe(200);
  });

  it('a Resolve racing an action create cannot leave an open action on a RESOLVED ticket (BR-09, BR-14)', async () => {
    for (let i = 0; i < 5; i++) {
      const ticket = await createTicket('IN_PROGRESS', { actions: ['COMPLETED'] });
      const [resolve, create] = await Promise.all([
        patchStatus(ticket.id, owner, { status: 'RESOLVED', resolutionSummary: 'Resolved during a race.' }),
        request(app)
          .post(`/api/tickets/${ticket.id}/actions`)
          .set(JSON_HEADERS)
          .set('Cookie', helper.cookie)
          .send({ clientRequestId: randomUUID(), description: 'Racing action entry.' }),
      ]);
      const after = await stored(ticket.id);
      const open = await prisma.actionTaken.count({ where: { ticketId: ticket.id, status: { in: ['PLANNED', 'IN_PROGRESS'] } } });
      if (after.currentStatus === 'RESOLVED') {
        expect(open).toBe(0);
        expect(create.status).toBe(409);
      } else {
        expect(resolve.status).toBe(409);
        expect(create.status).toBe(201);
      }
    }
  });
});
