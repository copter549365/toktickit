/**
 * server/tests/lab-04/requester-dashboard.api.test.ts
 *
 * Tests: API-L4-21..API-L4-24 (docs/lab-04/tests.md §2.4) — GET /api/dashboard/requester.
 * Requester isolation against reference SQL, metrics, list order and limits, the empty state,
 * roles, the rolling 7-day window, and drill-down consistency with GET /api/tickets.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const PREFIX = 'l4-req-dashboard';
const EMAILS = {
  requester: `${PREFIX}-requester@toktickit.com`,
  other: `${PREFIX}-other@toktickit.com`,
  staff: `${PREFIX}-staff@toktickit.com`,
  admin: `${PREFIX}-admin@toktickit.com`,
  mustChange: `${PREFIX}-must-change@toktickit.com`,
};

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';
type Fixture = { id: number; email: string; cookie: string };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// createdAt was added in D-18 (the staff Urgent list shows each Ticket's age).
const ITEM_KEYS = ['createdAt', 'currentStatus', 'id', 'itPriority', 'owner', 'requesterResolvedIndicator', 'resolvedAt', 'summary', 'ticketNumber', 'updatedAt'];

let requester: Fixture;
let other: Fixture;
let staff: Fixture;
let admin: Fixture;
let mustChange: Fixture;
let categoryId: number;
let relatedSystemId: number;
let base: number;

/** Fixture tickets by label, so assertions can name them. */
const t: Record<string, number> = {};

async function makeUser(key: keyof typeof EMAILS, role: Role, mustChangePassword = false): Promise<Fixture> {
  const email = EMAILS[key];
  const u = await prisma.user.upsert({
    where: { email },
    update: { role, isActive: true, mustChangePassword, name: `Dashboard ${key}` },
    create: { name: `Dashboard ${key}`, email, passwordHash: 'x', role, isActive: true, mustChangePassword },
  });
  const token = signSessionToken({ userId: u.id, email, role, mustChangePassword });
  return { id: u.id, email, cookie: `toktickit_session=${token}` };
}

async function makeTicket(
  label: string,
  requesterId: number,
  status: Status,
  updatedAt: Date,
  resolvedAt: Date | null = null,
) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1995-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Dashboard fixture ${label}`,
      description: 'Fixture ticket created for the Lab 4 requester dashboard API tests.',
      requestedPriority: 'MEDIUM',
      currentStatus: status,
      resolvedAt,
    },
  });
  // updatedAt is @updatedAt, so set it after the insert to control list order.
  await prisma.$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${updatedAt} WHERE id = ${ticket.id}`;
  t[label] = ticket.id;
  return ticket.id;
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAILS) } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

const getDashboard = (cookie?: string) => {
  const r = request(app).get('/api/dashboard/requester');
  return cookie ? r.set('Cookie', cookie) : r;
};

/** Reference SQL from api-spec §3.1 / BR-22, written independently of the route. */
async function referenceCounts(requesterId: number) {
  const [row] = await prisma.$queryRaw<
    { open_tickets: bigint; waiting_for_me: bigint; resolved: bigint; closed: bigint }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')) AS open_tickets,
      COUNT(*) FILTER (WHERE "currentStatus" = 'WAITING_FOR_REQUESTER') AS waiting_for_me,
      COUNT(*) FILTER (WHERE "currentStatus" = 'RESOLVED') AS resolved,
      COUNT(*) FILTER (WHERE "currentStatus" = 'CLOSED') AS closed
    FROM "Ticket" WHERE "requesterId" = ${requesterId}`;
  return {
    openTickets: Number(row!.open_tickets),
    waitingForMe: Number(row!.waiting_for_me),
    resolved: Number(row!.resolved),
    closed: Number(row!.closed),
  };
}

/** The active Requesters from prisma/seed.ts. */
const SEEDED_REQUESTERS = [
  'jennifer.anderson@toktickit.com',
  'david.lee@toktickit.com',
  'sarah.johnson@toktickit.com',
  'emily.davis@toktickit.com',
  'nina.wong@toktickit.com',
];

/**
 * Seeded users start with mustChangePassword = true, which the dashboard rightly refuses (403).
 * Clears the flag for the call and restores each user's own value afterwards.
 */
async function asSeededRequester<T>(email: string, fn: (cookie: string, id: number) => Promise<T>): Promise<T> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: false } });
  try {
    const token = signSessionToken({ userId: u.id, email, role: 'REQUESTER', mustChangePassword: false });
    return await fn(`toktickit_session=${token}`, u.id);
  } finally {
    await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: u.mustChangePassword } });
  }
}

function cardValues(body: any) {
  return Object.fromEntries(body.cards.map((c: any) => [c.key, c.value]));
}

beforeAll(async () => {
  await cleanup();
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id;
  requester = await makeUser('requester', 'REQUESTER');
  other = await makeUser('other', 'REQUESTER');
  staff = await makeUser('staff', 'IT_STAFF');
  admin = await makeUser('admin', 'ADMINISTRATOR');
  mustChange = await makeUser('mustChange', 'REQUESTER', true);

  base = Date.now();
  const at = (hoursAgo: number) => new Date(base - hoursAgo * HOUR_MS);

  // Requester: 6 active (2 waiting), 2 resolved, 1 closed, 1 cancelled. updatedAt descends with
  // the number, except `waitingTieA`/`waitingTieB`, which tie so that id DESC decides.
  await makeTicket('newT', requester.id, 'NEW', at(1));
  await makeTicket('waitingTieA', requester.id, 'WAITING_FOR_REQUESTER', at(2));
  await makeTicket('waitingTieB', requester.id, 'WAITING_FOR_REQUESTER', at(2));
  await makeTicket('openT', requester.id, 'OPEN', at(3));
  await makeTicket('resolvedInWindow', requester.id, 'RESOLVED', at(4), new Date(base - (7 * DAY_MS - HOUR_MS)));
  await makeTicket('inProgress', requester.id, 'IN_PROGRESS', at(5));
  await makeTicket('reopened', requester.id, 'REOPENED', at(6));
  await makeTicket('closedRecent', requester.id, 'CLOSED', at(7), new Date(base - DAY_MS));
  await makeTicket('resolvedOutside', requester.id, 'RESOLVED', at(8), new Date(base - (7 * DAY_MS + HOUR_MS)));
  await makeTicket('cancelled', requester.id, 'CANCELLED', at(9));

  // Another Requester's ticket is the most recently updated and waiting, so a scoping bug would
  // put it at the top of every list.
  await makeTicket('otherWaiting', other.id, 'WAITING_FOR_REQUESTER', at(0));
  await makeTicket('otherResolved', other.id, 'RESOLVED', at(0), new Date(base - HOUR_MS));
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('API-L4-21: Requester isolation (AC-18, BR-22, BR-26)', () => {
  it('each card value equals the reference SQL for this Requester', async () => {
    const res = await getDashboard(requester.cookie);
    expect(res.status).toBe(200);
    expect(cardValues(res.body)).toEqual(await referenceCounts(requester.id));
    expect(cardValues(res.body)).toEqual({ openTickets: 6, waitingForMe: 2, resolved: 2, closed: 1 });
  });

  it('no other Requester ticket appears in any list', async () => {
    const res = await getDashboard(requester.cookie);
    const listed = Object.values(res.body.lists).flatMap((l: any) => l.items.map((i: any) => i.id));
    expect(listed).not.toContain(t.otherWaiting);
    expect(listed).not.toContain(t.otherResolved);
    const own = await prisma.ticket.findMany({ where: { requesterId: requester.id }, select: { id: true } });
    const ownIds = new Set(own.map((o) => o.id));
    for (const id of listed) expect(ownIds.has(id)).toBe(true);
  });

  it('every seeded Requester gets values equal to the reference SQL', async () => {
    for (const email of SEEDED_REQUESTERS) {
      await asSeededRequester(email, async (cookie, id) => {
        const res = await getDashboard(cookie);
        expect(res.status, email).toBe(200);
        expect(cardValues(res.body), email).toEqual(await referenceCounts(id));
      });
    }
  });

  it('each card drill-down, sent to GET /api/tickets, returns totalCount equal to the card value (AC-22)', async () => {
    const res = await getDashboard(requester.cookie);
    for (const card of res.body.cards) {
      expect(card.drillDown.path).toBe('/tickets');
      const list = await request(app).get('/api/tickets').query(card.drillDown.query).set('Cookie', requester.cookie);
      expect(list.status).toBe(200);
      expect(list.body.meta.totalCount, card.key).toBe(card.value);
    }
  });
});

describe('API-L4-22: Requester metrics, lists, and empty state (AC-19, BR-22, BR-25)', () => {
  it('reports generatedAt, the display time zone, and the window', async () => {
    const res = await getDashboard(requester.cookie);
    expect(res.body.displayTimeZone).toBe('Asia/Bangkok');
    expect(res.body.recentWindowDays).toBe(7);
    expect(new Date(res.body.generatedAt).toISOString()).toBe(res.body.generatedAt);
    expect(Math.abs(new Date(res.body.generatedAt).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('attentionRequired holds WAITING_FOR_REQUESTER and RESOLVED Tickets, updatedAt DESC then id DESC', async () => {
    const res = await getDashboard(requester.cookie);
    const [tieFirst, tieSecond] = [t.waitingTieA!, t.waitingTieB!].sort((a, b) => b - a);
    expect(res.body.lists.attentionRequired.items.map((i: any) => i.id)).toEqual([
      tieFirst,
      tieSecond,
      t.resolvedInWindow,
      t.resolvedOutside,
    ]);
  });

  it('recentlyUpdated holds the 5 most recently updated owned Tickets of any status', async () => {
    const res = await getDashboard(requester.cookie);
    const [tieFirst, tieSecond] = [t.waitingTieA!, t.waitingTieB!].sort((a, b) => b - a);
    expect(res.body.lists.recentlyUpdated.items.map((i: any) => i.id)).toEqual([
      t.newT,
      tieFirst,
      tieSecond,
      t.openT,
      t.resolvedInWindow,
    ]);
  });

  it('recentlyResolved holds RESOLVED/CLOSED Tickets resolved in the last 7 days, resolvedAt DESC', async () => {
    const res = await getDashboard(requester.cookie);
    expect(res.body.lists.recentlyResolved.items.map((i: any) => i.id)).toEqual([t.closedRecent, t.resolvedInWindow]);
  });

  it('every list holds at most 5 concise items with only the documented keys', async () => {
    const res = await getDashboard(requester.cookie);
    for (const list of Object.values(res.body.lists) as any[]) {
      expect(list.items.length).toBeLessThanOrEqual(5);
      for (const item of list.items) expect(Object.keys(item).sort()).toEqual(ITEM_KEYS);
    }
  });

  it('gives each list its documented "View all" target', async () => {
    const res = await getDashboard(requester.cookie);
    expect(res.body.lists.attentionRequired.viewAll).toEqual({ path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } });
    expect(res.body.lists.recentlyUpdated.viewAll).toEqual({ path: '/tickets', query: { sortBy: 'updatedAt', sortOrder: 'desc' } });
    expect(res.body.lists.recentlyResolved.viewAll).toEqual({ path: '/tickets', query: { currentStatus: 'RESOLVED' } });
  });

  it('the recentlyUpdated "View all" drill-down lists Tickets in the same order', async () => {
    const res = await getDashboard(requester.cookie);
    const list = await request(app)
      .get('/api/tickets')
      .query({ ...res.body.lists.recentlyUpdated.viewAll.query, pageSize: 10 })
      .set('Cookie', requester.cookie);
    expect(list.body.data.slice(0, 5).map((d: any) => d.id)).toEqual(
      res.body.lists.recentlyUpdated.items.map((i: any) => i.id),
    );
  });

  it('nina.wong gets all zeros and empty lists with an unchanged shape', async () => {
    const res = await asSeededRequester('nina.wong@toktickit.com', (cookie) => getDashboard(cookie));
    expect(res.status).toBe(200);
    expect(res.body.cards.map((c: any) => [c.key, c.value])).toEqual([
      ['openTickets', 0],
      ['waitingForMe', 0],
      ['resolved', 0],
      ['closed', 0],
    ]);
    expect(Object.keys(res.body.lists).sort()).toEqual(['attentionRequired', 'recentlyResolved', 'recentlyUpdated']);
    for (const list of Object.values(res.body.lists) as any[]) {
      expect(list.items).toEqual([]);
      expect(list.viewAll.path).toBe('/tickets');
    }
  });
});

describe('API-L4-23: Requester endpoint roles (AC-21, BR-26)', () => {
  it('IT Staff get 403 FORBIDDEN_ROLE', async () => {
    const res = await getDashboard(staff.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('an Administrator gets 403 FORBIDDEN_ROLE', async () => {
    const res = await getDashboard(admin.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('an unauthenticated caller gets 401', async () => {
    expect((await getDashboard()).status).toBe(401);
  });

  it('a must-change-password Requester gets 403 PASSWORD_CHANGE_REQUIRED', async () => {
    const res = await getDashboard(mustChange.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('the dashboard is read-only: POST is not a route', async () => {
    const res = await request(app)
      .post('/api/dashboard/requester')
      .set('Cookie', requester.cookie)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(404);
  });
});

describe('API-L4-24: Recent window boundary and legacy data (BR-21, BR-27)', () => {
  it('resolvedAt = now - 6d23h is included and now - 7d1h is excluded', async () => {
    const res = await getDashboard(requester.cookie);
    const ids = res.body.lists.recentlyResolved.items.map((i: any) => i.id);
    expect(ids).toContain(t.resolvedInWindow);
    expect(ids).not.toContain(t.resolvedOutside);
  });

  it('a RESOLVED Ticket outside the window still counts in the Resolved card', async () => {
    const res = await getDashboard(requester.cookie);
    expect(cardValues(res.body).resolved).toBe(2);
  });

  it('Tickets with no Actions Taken (legacy shape) count in the status metrics', async () => {
    expect(await prisma.actionTaken.count({ where: { ticket: { requesterId: requester.id } } })).toBe(0);
    const res = await getDashboard(requester.cookie);
    expect(cardValues(res.body).openTickets).toBe(6);
  });

  it('a RESOLVED Ticket with no resolvedAt is counted but never listed as recently resolved', async () => {
    const id = await makeTicket('resolvedNoDate', requester.id, 'RESOLVED', new Date(base - 10 * HOUR_MS), null);
    try {
      const res = await getDashboard(requester.cookie);
      expect(cardValues(res.body).resolved).toBe(3);
      expect(res.body.lists.recentlyResolved.items.map((i: any) => i.id)).not.toContain(id);
    } finally {
      await prisma.ticket.delete({ where: { id } });
    }
  });
});
