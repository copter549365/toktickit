import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';

describe('API-01..API-06: Create Ticket Endpoint', () => {
  it('API-01: POST /api/tickets with valid body creates a ticket with NEW status and unique Ticket Number', async () => {
    const activeRequester = await prisma.requesterUser.findFirst({
      where: { isActive: true },
    });
    expect(activeRequester).not.toBeNull();

    const category = await prisma.category.findFirst();
    expect(category).not.toBeNull();

    const relatedSystem = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });
    expect(relatedSystem).not.toBeNull();

    const response = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(activeRequester!.id))
      .send({
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: 'Cannot connect to company VPN network',
        description: 'Every time I attempt to connect to the corporate VPN from home it fails with error 403.',
        requestedPriority: 'HIGH',
        // Client-sent read-only fields should be ignored/overridden
        ticketNumber: 'TKT-9999-999999',
        currentStatus: 'RESOLVED',
        itPriority: 'HIGH',
        ticketOwnerId: 99,
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        ticketNumber: expect.stringMatching(/^TKT-\d{4}-\d{6}$/),
        requesterId: activeRequester!.id,
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: 'Cannot connect to company VPN network',
        description: 'Every time I attempt to connect to the corporate VPN from home it fails with error 403.',
        requestedPriority: 'HIGH',
        itPriority: null,
        currentStatus: 'NEW',
        ticketOwnerId: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    );

    // Verify row was persisted in database
    const savedTicket = await prisma.ticket.findUnique({
      where: { id: response.body.id },
    });
    expect(savedTicket).not.toBeNull();
    expect(savedTicket?.currentStatus).toBe('NEW');
    expect(savedTicket?.requesterId).toBe(activeRequester!.id);
  });

  it('API-02: POST /api/tickets missing Summary returns 400 VALIDATION_FAILED with fieldErrors.summary', async () => {
    const activeRequester = await prisma.requesterUser.findFirst({
      where: { isActive: true },
    });
    const category = await prisma.category.findFirst();
    const relatedSystem = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });

    const uniqueDescription = `Unique description for API-02 test ${Date.now()}`;

    const response = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(activeRequester!.id))
      .send({
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: '   ',
        description: uniqueDescription,
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_FAILED');
    expect(response.body.fieldErrors?.summary).toBeDefined();

    const savedTicket = await prisma.ticket.findFirst({
      where: { description: uniqueDescription },
    });
    expect(savedTicket).toBeNull();
  });

  it('API-03: POST /api/tickets with Description too short returns 400 VALIDATION_FAILED with fieldErrors.description', async () => {
    const activeRequester = await prisma.requesterUser.findFirst({
      where: { isActive: true },
    });
    const category = await prisma.category.findFirst();
    const relatedSystem = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });

    const uniqueSummary = `Unique summary API-03 ${Date.now()}`;

    const response = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(activeRequester!.id))
      .send({
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: uniqueSummary,
        description: 'Too short', // 9 characters
        requestedPriority: 'LOW',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_FAILED');
    expect(response.body.fieldErrors?.description).toBe('Description must be 10-2000 characters.');

    const savedTicket = await prisma.ticket.findFirst({
      where: { summary: uniqueSummary },
    });
    expect(savedTicket).toBeNull();
  });

  it('API-04: POST /api/tickets with unknown categoryId returns 400 INVALID_REFERENCE', async () => {
    const activeRequester = await prisma.requesterUser.findFirst({
      where: { isActive: true },
    });
    const relatedSystem = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });

    const response = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(activeRequester!.id))
      .send({
        categoryId: 999999, // Unknown category
        relatedSystemId: relatedSystem!.id,
        summary: 'Cannot login to application',
        description: 'Authentication returns 500 internal server error repeatedly.',
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'INVALID_REFERENCE',
      field: 'categoryId',
    });
  });

  it('API-05: POST /api/tickets missing x-requester-id returns 400 MISSING_REQUESTER_CONTEXT', async () => {
    const category = await prisma.category.findFirst();
    const relatedSystem = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });

    const response = await request(app)
      .post('/api/tickets')
      .send({
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: 'Cannot login to application',
        description: 'Authentication returns 500 internal server error repeatedly.',
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'MISSING_REQUESTER_CONTEXT',
    });
  });

  it('API-06: POST /api/tickets with an inactive Requester ID returns 401 INVALID_REQUESTER_CONTEXT', async () => {
    const inactiveRequester = await prisma.requesterUser.findFirst({
      where: { isActive: false },
    });
    expect(inactiveRequester).not.toBeNull();

    const category = await prisma.category.findFirst();
    const relatedSystem = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });

    const response = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(inactiveRequester!.id))
      .send({
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: 'Cannot login to application',
        description: 'Authentication returns 500 internal server error repeatedly.',
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'INVALID_REQUESTER_CONTEXT',
    });
  });
});
