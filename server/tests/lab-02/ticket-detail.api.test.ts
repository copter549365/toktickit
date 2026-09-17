import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';

describe('API-14..API-16: Ticket Detail Endpoint', () => {
  const runToken = `TicketDetailRun${Date.now()}`;
  let requesterA: { id: number };
  let requesterB: { id: number };
  let ownedTicket: { id: number };
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const requesters = await prisma.requesterUser.findMany({
      where: { isActive: true },
      take: 2,
    });
    requesterA = requesters[0];
    requesterB = requesters[1];

    const category = await prisma.category.findFirst();
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    ownedTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-1997-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        requesterId: requesterA.id,
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: `${runToken} ticket detail fixture`,
        description: 'Fixture ticket created for the Ticket Detail API endpoint tests.',
        requestedPriority: 'MEDIUM',
        currentStatus: 'NEW',
      },
    });
    createdTicketIds.push(ownedTicket.id);
  });

  afterAll(async () => {
    if (createdTicketIds.length > 0) {
      await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
  });

  it('API-14: GET /api/tickets/:id for an owned ticket returns 200 with full read-only field set', async () => {
    const response = await request(app)
      .get(`/api/tickets/${ownedTicket.id}`)
      .set('x-requester-id', String(requesterA.id));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: ownedTicket.id,
        ticketNumber: expect.any(String),
        requesterId: requesterA.id,
        categoryId: expect.any(Number),
        categoryName: expect.any(String),
        relatedSystemId: expect.any(Number),
        relatedSystemName: expect.any(String),
        summary: `${runToken} ticket detail fixture`,
        description: expect.any(String),
        requestedPriority: 'MEDIUM',
        itPriority: null,
        currentStatus: 'NEW',
        ticketOwnerId: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        attachments: [],
      }),
    );
  });

  it('API-15: GET /api/tickets/:id for a ticket owned by another Requester returns 404 TICKET_NOT_FOUND', async () => {
    const response = await request(app)
      .get(`/api/tickets/${ownedTicket.id}`)
      .set('x-requester-id', String(requesterB.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'TICKET_NOT_FOUND' });
  });

  it('API-16: GET /api/tickets/:id for a nonexistent id returns 404 TICKET_NOT_FOUND, identical shape to API-15', async () => {
    const nonExistentId = ownedTicket.id + 999999;

    const response = await request(app)
      .get(`/api/tickets/${nonExistentId}`)
      .set('x-requester-id', String(requesterA.id));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'TICKET_NOT_FOUND' });
  });
});
