import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';

const createdTicketIds: number[] = [];

function uniqueTicketNumber(index: number) {
  return `TKT-1999-${String(index + 1).padStart(6, '0')}`;
}

describe('API-07..API-13: My Tickets List Endpoint', () => {
  let requesterA: { id: number };
  let requesterB: { id: number };
  let categoryOne: { id: number };
  let categoryTwo: { id: number };
  let relatedSystem: { id: number };

  // Every fixture ticket's summary embeds this per-run token, and every list query below scopes
  // with `search: runToken`. That keeps assertions exact and self-contained against the shared dev
  // DB without needing dedicated Requesters (which would race the seed idempotency test's counts).
  const runToken = `MyTixRun${Date.now()}`;

  afterAll(async () => {
    if (createdTicketIds.length > 0) {
      await prisma.attachment.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      });
      await prisma.ticket.deleteMany({
        where: { id: { in: createdTicketIds } },
      });
    }
  });

  beforeAll(async () => {
    const requesters = await prisma.requesterUser.findMany({
      where: { isActive: true },
      take: 2,
    });
    requesterA = requesters[0];
    requesterB = requesters[1];

    const categories = await prisma.category.findMany({ take: 2 });
    categoryOne = categories[0];
    categoryTwo = categories[1];

    const activeRelatedSystem = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });
    relatedSystem = activeRelatedSystem!;

    // Requester A: 12 NEW tickets across two categories, so pagination/sort/filter have real data to work with.
    for (let i = 0; i < 12; i++) {
      let summary = `${runToken} fixture ticket ${i}`;
      if (i === 0) summary = `${runToken} laptop battery drains quickly`;
      if (i === 1) summary = `${runToken} 100% CPU spike_issue`;
      if (i === 2) summary = `${runToken} 1000 CPU spike-issue`;

      const t = await prisma.ticket.create({
        data: {
          ticketNumber: uniqueTicketNumber(i),
          requesterId: requesterA.id,
          categoryId: i < 2 ? categoryTwo.id : categoryOne.id,
          relatedSystemId: relatedSystem.id,
          summary,
          description: 'Fixture ticket created for My Tickets API list endpoint tests.',
          requestedPriority: 'MEDIUM',
          currentStatus: 'NEW',
        },
      });
      createdTicketIds.push(t.id);
    }

    // Requester B: a couple of tickets that must never leak into A's list (BR-08, AC-11).
    for (let i = 0; i < 2; i++) {
      const t = await prisma.ticket.create({
        data: {
          ticketNumber: uniqueTicketNumber(12 + i),
          requesterId: requesterB.id,
          categoryId: categoryOne.id,
          relatedSystemId: relatedSystem.id,
          summary: `${runToken} requester B fixture ticket ${i}`,
          description: 'Fixture ticket belonging to a different Requester.',
          requestedPriority: 'LOW',
          currentStatus: 'NEW',
        },
      });
      createdTicketIds.push(t.id);
    }
  });

  it('API-07: GET /api/tickets for Requester A only returns Requester A tickets, even though Requester B has tickets too', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: runToken, pageSize: 50 });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(12);
    expect(response.body.meta.totalCount).toBe(12);

    // Requester A must never see Requester B's rows, even when the search term matches both (BR-08, AC-11).
    const requesterBLeak = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: `${runToken} requester B` });
    expect(requesterBLeak.body.data).toEqual([]);
  });

  it('API-08: GET /api/tickets?search= matches ticket number or summary text for the acting Requester', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: `${runToken} laptop battery` });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].summary).toContain('laptop battery drains quickly');
  });

  it('API-08b: GET /api/tickets?search= escapes literal % and _ so they do not act as SQL wildcards', async () => {
    // Search with % should match '100%' but NOT '1000'
    const percentResponse = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: `${runToken} 100%` });

    expect(percentResponse.status).toBe(200);
    expect(percentResponse.body.data.length).toBe(1);
    expect(percentResponse.body.data[0].summary).toContain('100% CPU spike_issue');

    // Search with _ should match 'spike_issue' but NOT 'spike-issue'
    const underscoreResponse = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: `${runToken} spike_` });

    expect(underscoreResponse.status).toBe(200);
    expect(underscoreResponse.body.data.length).toBe(1);
    expect(underscoreResponse.body.data[0].summary).toContain('100% CPU spike_issue');
  });

  it('API-09: GET /api/tickets?search= with no matches returns empty data and totalCount 0', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: `${runToken}-no-such-ticket-exists` });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.totalCount).toBe(0);
  });

  it('API-10: GET /api/tickets?categoryId=&currentStatus= applies combined filters while staying owner-scoped', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: runToken, categoryId: categoryTwo.id, currentStatus: 'NEW', pageSize: 50 });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);
    for (const ticket of response.body.data) {
      expect(ticket.categoryId).toBe(categoryTwo.id);
      expect(ticket.currentStatus).toBe('NEW');
    }
  });

  it('API-11: GET /api/tickets?page=2&pageSize=10 beyond available rows returns empty data with valid meta (BR-29)', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterB.id))
      .query({ search: runToken, page: 5, pageSize: 10 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toEqual({
      page: 5,
      pageSize: 10,
      totalCount: 2,
      totalPages: 1,
    });
  });

  it('API-12: GET /api/tickets?sortBy=ticketNumber&sortOrder=desc orders results descending by ticket number', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: runToken, sortBy: 'ticketNumber', sortOrder: 'desc', pageSize: 50 });

    expect(response.status).toBe(200);
    const ticketNumbers = response.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    const sorted = [...ticketNumbers].sort().reverse();
    expect(ticketNumbers).toEqual(sorted);
  });

  it('API-13: GET /api/tickets?pageSize=999 falls back to the default page size of 10 (BR-28)', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: runToken, pageSize: 999 });

    expect(response.status).toBe(200);
    expect(response.body.meta.pageSize).toBe(10);
    expect(response.body.data.length).toBe(10);
  });

  it('GET /api/tickets defaults to sorting by createdAt descending when no sort is specified (BR-27)', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .query({ search: runToken, pageSize: 50 });

    expect(response.status).toBe(200);
    const createdDates = response.body.data.map((t: { createdAt: string }) => new Date(t.createdAt).getTime());
    const sortedDesc = [...createdDates].sort((a, b) => b - a);
    expect(createdDates).toEqual(sortedDesc);
  });

  it('GET /api/tickets without x-requester-id returns 400 MISSING_REQUESTER_CONTEXT', async () => {
    const response = await request(app).get('/api/tickets');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'MISSING_REQUESTER_CONTEXT' });
  });

  it('GET /api/tickets with an inactive Requester ID returns 401 INVALID_REQUESTER_CONTEXT', async () => {
    const inactiveRequester = await prisma.requesterUser.findFirst({
      where: { isActive: false },
    });
    expect(inactiveRequester).not.toBeNull();

    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(inactiveRequester!.id));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'INVALID_REQUESTER_CONTEXT' });
  });
});
