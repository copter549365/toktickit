/**
 * server/tests/lab-04/staff-dashboard.api.test.ts
 *
 * Tests: API-L4-25..API-L4-29 and the dashboard part of API-L4-15 (docs/lab-04/tests.md §2.4).
 * GET /api/dashboard/staff: every metric against an independent Prisma count, "my" values for the
 * caller only, Administrator user-account counts, roles, drill-down consistency with the list
 * endpoints, the concise payload, and the `isActive` filter on GET /api/admin/users (D-18).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const PREFIX = 'l4-staff-dashboard';
const EMAILS = {
  me: `${PREFIX}-me@toktickit.com`,
  other: `${PREFIX}-other@toktickit.com`,
  admin: `${PREFIX}-admin@toktickit.com`,
  requester: `${PREFIX}-requester@toktickit.com`,
  mustChange: `${PREFIX}-must-change@toktickit.com`,
};

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
type Fixture = { id: number; email: string; cookie: string };

const ACTIVE: Status[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'];
const DAY_MS = 24 * 60 * 60 * 1000;
const TICKET_ITEM_KEYS = ['createdAt', 'currentStatus', 'id', 'itPriority', 'owner', 'requesterResolvedIndicator', 'resolvedAt', 'summary', 'ticketNumber', 'updatedAt'];
const ACTION_ITEM_KEYS = ['actionAt', 'actionId', 'description', 'followUpRequired', 'status', 'ticketId', 'ticketNumber', 'ticketSummary'];

let me: Fixture;
let other: Fixture;
let admin: Fixture;
let requester: Fixture;
let mustChange: Fixture;
let categoryId: number;
let relatedSystemId: number;
const t: Record<string, number> = {};
const a: Record<string, number> = {};

async function makeUser(key: keyof typeof EMAILS, role: Role, mustChangePassword = false): Promise<Fixture> {
  const email = EMAILS[key];
  const u = await prisma.user.upsert({
    where: { email },
    update: { role, isActive: true, mustChangePassword, name: `Staff Dashboard ${key}` },
    create: { name: `Staff Dashboard ${key}`, email, passwordHash: 'x', role, isActive: true, mustChangePassword },
  });
  const token = signSessionToken({ userId: u.id, email, role, mustChangePassword });
  return { id: u.id, email, cookie: `toktickit_session=${token}` };
}

async function makeTicket(label: string, status: Status, itPriority: Priority | null, ownerId: number | null, indicator = false) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1994-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId: requester.id,
      categoryId,
      relatedSystemId,
      summary: `Staff dashboard fixture ${label}`,
      description: 'Fixture ticket created for the Lab 4 staff dashboard API tests.',
      requestedPriority: 'MEDIUM',
      itPriority,
      currentStatus: status,
      ticketOwnerId: ownerId,
      requesterResolvedIndicator: indicator,
    },
  });
  t[label] = ticket.id;
  return ticket.id;
}

async function makeAction(label: string, ticketId: number, assigneeId: number, status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED', daysAgo: number) {
  const action = await prisma.actionTaken.create({
    data: {
      ticketId,
      clientRequestId: randomUUID(),
      actionAt: new Date(Date.now() - daysAgo * DAY_MS),
      description: `Fixture action ${label}`,
      status,
      result: status === 'COMPLETED' ? 'Fixture result text.' : null,
      followUpRequired: label === 'inProgress',
      followUpNote: label === 'inProgress' ? 'Check again next week.' : null,
      assigneeId,
      createdById: assigneeId,
      lastUpdatedById: assigneeId,
      performedById: status === 'COMPLETED' ? assigneeId : null,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
  });
  a[label] = action.id;
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAILS) } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.ticket.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { ticketOwnerId: { in: ids } }] } });
  await prisma.actionTaken.deleteMany({ where: { assigneeId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

const getDashboard = (cookie?: string) => {
  const r = request(app).get('/api/dashboard/staff');
  return cookie ? r.set('Cookie', cookie) : r;
};

const byKey = (cards: any[]) => Object.fromEntries(cards.map((c) => [c.key, c.value]));

/** Seeded staff start with mustChangePassword = true; clear it for the call, then restore it. */
async function asSeededStaff<T>(email: string, fn: (cookie: string, id: number) => Promise<T>): Promise<T> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: false } });
  try {
    const token = signSessionToken({ userId: u.id, email, role: u.role, mustChangePassword: false });
    return await fn(`toktickit_session=${token}`, u.id);
  } finally {
    await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: u.mustChangePassword } });
  }
}

beforeAll(async () => {
  await cleanup();
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id;
  me = await makeUser('me', 'IT_STAFF');
  other = await makeUser('other', 'IT_STAFF');
  admin = await makeUser('admin', 'ADMINISTRATOR');
  requester = await makeUser('requester', 'REQUESTER');
  mustChange = await makeUser('mustChange', 'IT_STAFF', true);

  // "me" owns 2 active Tickets and 1 resolved one; the others are unassigned or another's.
  await makeTicket('mineHigh', 'IN_PROGRESS', 'HIGH', me.id);
  await makeTicket('mineWaiting', 'WAITING_FOR_REQUESTER', 'LOW', me.id);
  await makeTicket('mineResolved', 'RESOLVED', 'MEDIUM', me.id);
  await makeTicket('unassignedNew', 'NEW', 'HIGH', null);
  await makeTicket('otherMarked', 'OPEN', 'MEDIUM', other.id, true);

  // "me" has 2 open actions (ordered by actionAt ASC) and 1 completed one; "other" has 1 open.
  await makeAction('inProgress', t.mineHigh!, me.id, 'IN_PROGRESS', 1);
  await makeAction('planned', t.otherMarked!, me.id, 'PLANNED', 2);
  await makeAction('completed', t.mineHigh!, me.id, 'COMPLETED', 3);
  await makeAction('otherPlanned', t.otherMarked!, other.id, 'PLANNED', 4);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('API-L4-25: Staff metrics equal independent counts (AC-20, BR-23)', () => {
  it('reports generatedAt and the display time zone', async () => {
    const res = await getDashboard(me.cookie);
    expect(res.status).toBe(200);
    expect(res.body.displayTimeZone).toBe('Asia/Bangkok');
    expect(new Date(res.body.generatedAt).toISOString()).toBe(res.body.generatedAt);
  });

  it('each status card equals a Prisma count for that status', async () => {
    const res = await getDashboard(me.cookie);
    expect(res.body.statusCards.map((c: any) => c.key)).toEqual(['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED', 'RESOLVED']);
    for (const card of res.body.statusCards) {
      expect(card.value, card.key).toBe(await prisma.ticket.count({ where: { currentStatus: card.key } }));
    }
  });

  it('each IT Priority card equals a Prisma count of active Tickets with that priority', async () => {
    const res = await getDashboard(me.cookie);
    for (const card of res.body.priorityCards) {
      expect(card.value, card.key).toBe(
        await prisma.ticket.count({ where: { itPriority: card.key, currentStatus: { in: ACTIVE } } }),
      );
    }
  });

  it('workload cards equal independent counts, and "my" values are the caller\'s own', async () => {
    const res = await getDashboard(me.cookie);
    const w = byKey(res.body.workloadCards);
    expect(w.unassignedActive).toBe(await prisma.ticket.count({ where: { ticketOwnerId: null, currentStatus: { in: ACTIVE } } }));
    expect(w.requesterMarkedResolved).toBe(
      await prisma.ticket.count({ where: { requesterResolvedIndicator: true, currentStatus: { in: ACTIVE } } }),
    );
    expect(w.myActive).toBe(2);
    expect(w.myOpenActions).toBe(2);
  });

  it('another staff member sees their own "my" values', async () => {
    const res = await getDashboard(other.cookie);
    const w = byKey(res.body.workloadCards);
    expect(w.myActive).toBe(1);
    expect(w.myOpenActions).toBe(1);
    expect(res.body.lists.myOpenActions.items.map((i: any) => i.actionId)).toEqual([a.otherPlanned]);
  });

  it('olivia.chen gets 0 My Assigned and an empty My Open Actions', async () => {
    const res = await asSeededStaff('olivia.chen@toktickit.com', (cookie) => getDashboard(cookie));
    expect(res.status).toBe(200);
    const w = byKey(res.body.workloadCards);
    expect(w.myActive).toBe(0);
    expect(w.myOpenActions).toBe(0);
    expect(res.body.lists.myOpenActions.items).toEqual([]);
  });

  it('myOpenActions lists the caller\'s PLANNED/IN_PROGRESS actions, actionAt ASC', async () => {
    const res = await getDashboard(me.cookie);
    const items = res.body.lists.myOpenActions.items;
    expect(items.map((i: any) => i.actionId)).toEqual([a.planned, a.inProgress]);
    expect(items[1]).toMatchObject({
      ticketId: t.mineHigh,
      description: 'Fixture action inProgress',
      status: 'IN_PROGRESS',
      followUpRequired: true,
      ticketSummary: 'Staff dashboard fixture mineHigh',
    });
  });

  it('urgent equals an independent query: active HIGH, createdAt ASC, id DESC, at most 5', async () => {
    const res = await getDashboard(me.cookie);
    const expected = await prisma.ticket.findMany({
      where: { itPriority: 'HIGH', currentStatus: { in: ACTIVE } },
      orderBy: [{ createdAt: 'asc' }, { id: 'desc' }],
      take: 5,
      select: { id: true },
    });
    expect(res.body.lists.urgent.items.map((i: any) => i.id)).toEqual(expected.map((e) => e.id));
  });

  it('recentlyUpdated equals an independent query over all Tickets, updatedAt DESC, id DESC', async () => {
    const res = await getDashboard(me.cookie);
    const expected = await prisma.ticket.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 5, select: { id: true } });
    expect(res.body.lists.recentlyUpdated.items.map((i: any) => i.id)).toEqual(expected.map((e) => e.id));
  });

  it('gives the lists their documented "View all" targets', async () => {
    const res = await getDashboard(me.cookie);
    expect(res.body.lists.urgent.viewAll).toEqual({
      path: '/staff/tickets',
      query: { itPriority: 'HIGH', statusGroup: 'active', sortBy: 'createdAt', sortOrder: 'asc' },
    });
    expect(res.body.lists.recentlyUpdated.viewAll).toEqual({ path: '/staff/tickets', query: { sortBy: 'updatedAt', sortOrder: 'desc' } });
  });
});

describe('API-L4-15 (dashboard part): the advisory Requester signal is counted (AC-13, BR-16)', () => {
  it('a newly flagged active Ticket raises "Marked Resolved by Requester" by 1 and is in its drill-down', async () => {
    const before = byKey((await getDashboard(me.cookie)).body.workloadCards).requesterMarkedResolved;
    const id = await makeTicket('newlyMarked', 'IN_PROGRESS', 'LOW', me.id, true);
    try {
      const res = await getDashboard(me.cookie);
      const card = res.body.workloadCards.find((c: any) => c.key === 'requesterMarkedResolved');
      expect(card.value).toBe(before + 1);
      const list = await request(app).get('/api/staff/tickets').query({ ...card.drillDown.query, pageSize: 50 }).set('Cookie', me.cookie);
      expect(list.body.data.map((d: any) => d.id)).toContain(id);
    } finally {
      await prisma.ticket.delete({ where: { id } });
    }
  });

  it('a flagged Ticket that is no longer active is not counted', async () => {
    const before = byKey((await getDashboard(me.cookie)).body.workloadCards).requesterMarkedResolved;
    const id = await makeTicket('flaggedClosed', 'CLOSED', 'LOW', me.id, true);
    try {
      expect(byKey((await getDashboard(me.cookie)).body.workloadCards).requesterMarkedResolved).toBe(before);
    } finally {
      await prisma.ticket.delete({ where: { id } });
    }
  });
});

describe('API-L4-26: Administrator additions and roles (AC-21, BR-24, BR-26)', () => {
  it('IT Staff get userAccounts = null', async () => {
    const res = await getDashboard(me.cookie);
    expect(res.body.userAccounts).toBeNull();
  });

  it('an Administrator gets the staff payload plus userAccounts equal to the user-table counts', async () => {
    const res = await getDashboard(admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.statusCards).toHaveLength(6);
    expect(byKey(res.body.userAccounts)).toEqual({
      activeRequesters: await prisma.user.count({ where: { role: 'REQUESTER', isActive: true } }),
      activeItStaff: await prisma.user.count({ where: { role: 'IT_STAFF', isActive: true } }),
      activeAdministrators: await prisma.user.count({ where: { role: 'ADMINISTRATOR', isActive: true } }),
      inactiveUsers: await prisma.user.count({ where: { isActive: false } }),
    });
  });

  it('a Requester gets 403 FORBIDDEN_ROLE', async () => {
    const res = await getDashboard(requester.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('a must-change-password staff member gets 403, and an unauthenticated caller 401', async () => {
    expect((await getDashboard(mustChange.cookie)).body.error).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await getDashboard()).status).toBe(401);
  });
});

describe('API-L4-27: Drill-down consistency (AC-22, FR-16)', () => {
  it('every Ticket card drill-down, sent to GET /api/staff/tickets, returns totalCount equal to the card', async () => {
    const res = await getDashboard(me.cookie);
    const cards = [...res.body.statusCards, ...res.body.workloadCards, ...res.body.priorityCards].filter((c: any) => c.drillDown);
    expect(cards.length).toBe(12);
    for (const card of cards) {
      expect(card.drillDown.path).toBe('/staff/tickets');
      const list = await request(app).get('/api/staff/tickets').query(card.drillDown.query).set('Cookie', me.cookie);
      expect(list.status).toBe(200);
      expect(list.body.meta.totalCount, card.key).toBe(card.value);
    }
  });

  it('My Open Actions has no card drill-down; its list items point at the Ticket', async () => {
    const res = await getDashboard(me.cookie);
    expect(res.body.workloadCards.find((c: any) => c.key === 'myOpenActions').drillDown).toBeNull();
  });

  it('every user-account card drill-down, sent to GET /api/admin/users, returns as many users as the card (D-18)', async () => {
    const res = await getDashboard(admin.cookie);
    for (const card of res.body.userAccounts) {
      expect(card.drillDown.path).toBe('/admin/users');
      const list = await request(app).get('/api/admin/users').query(card.drillDown.query).set('Cookie', admin.cookie);
      expect(list.status).toBe(200);
      expect(list.body.length, card.key).toBe(card.value);
    }
  });
});

describe('API-L4-28: Concise payload (BR-21, handout §6.2)', () => {
  it('Ticket lists hold at most 5 items with only the documented keys', async () => {
    const res = await getDashboard(me.cookie);
    for (const list of [res.body.lists.urgent, res.body.lists.recentlyUpdated]) {
      expect(list.items.length).toBeLessThanOrEqual(5);
      for (const item of list.items) expect(Object.keys(item).sort()).toEqual(TICKET_ITEM_KEYS);
    }
  });

  it('My Open Actions items hold only the documented keys (no result, notes, or people)', async () => {
    const res = await getDashboard(me.cookie);
    expect(res.body.lists.myOpenActions.items.length).toBeGreaterThan(0);
    for (const item of res.body.lists.myOpenActions.items) expect(Object.keys(item).sort()).toEqual(ACTION_ITEM_KEYS);
  });

  it('the dashboard is read-only: POST is not a route', async () => {
    const res = await request(app).post('/api/dashboard/staff').set('Cookie', me.cookie).set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(404);
  });
});

describe('API-L4-29: GET /api/admin/users isActive filter (D-18)', () => {
  it('isActive=false returns only inactive users and isActive=true only active ones', async () => {
    const inactive = await request(app).get('/api/admin/users').query({ isActive: 'false' }).set('Cookie', admin.cookie);
    expect(inactive.body.length).toBe(await prisma.user.count({ where: { isActive: false } }));
    expect(inactive.body.every((u: any) => u.isActive === false)).toBe(true);

    const active = await request(app).get('/api/admin/users').query({ isActive: 'true', role: 'IT_STAFF' }).set('Cookie', admin.cookie);
    expect(active.body.every((u: any) => u.isActive === true && u.role === 'IT_STAFF')).toBe(true);
    expect(active.body.length).toBe(await prisma.user.count({ where: { isActive: true, role: 'IT_STAFF' } }));
  });

  it('an invalid isActive value is ignored (Lab 2 BR-27..29)', async () => {
    const all = await request(app).get('/api/admin/users').set('Cookie', admin.cookie);
    const junk = await request(app).get('/api/admin/users').query({ isActive: 'maybe' }).set('Cookie', admin.cookie);
    expect(junk.status).toBe(200);
    expect(junk.body.length).toBe(all.body.length);
  });
});
