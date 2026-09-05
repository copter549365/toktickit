import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';

describe('API-17..API-21: Attachment Uploads Endpoint', () => {
  let requesterA: { id: number };
  let requesterB: { id: number };
  let testTicket: { id: number };

  afterEach(async () => {
    if (testTicket?.id) {
      await prisma.attachment.deleteMany({
        where: { ticketId: testTicket.id },
      });
      await prisma.ticket.deleteMany({
        where: { id: testTicket.id },
      });
    }
  });

  beforeEach(async () => {
    const requesters = await prisma.requesterUser.findMany({
      where: { isActive: true },
      take: 2,
    });
    requesterA = requesters[0];
    requesterB = requesters[1];

    const category = await prisma.category.findFirst();
    const relatedSystem = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });

    testTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-1998-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        requesterId: requesterA.id,
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: 'Test ticket for attachment testing',
        description: 'Detailed description for testing attachment upload API endpoints.',
        requestedPriority: 'MEDIUM',
        currentStatus: 'NEW',
      },
    });
  });

  it('API-17: POST /api/tickets/:id/attachments valid JPG under 5MB on owned ticket persists attachment', async () => {
    const fakeJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const response = await request(app)
      .post(`/api/tickets/${testTicket.id}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', fakeJpgBuffer, 'screenshot.jpg');

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        ticketId: testTicket.id,
        originalFileName: 'screenshot.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: fakeJpgBuffer.length,
        isRemoved: false,
        uploadedAt: expect.any(String),
      }),
    );

    const saved = await prisma.attachment.findUnique({
      where: { id: response.body.id },
    });
    expect(saved).not.toBeNull();
    expect(saved?.isRemoved).toBe(false);
  });

  it('API-18: POST /api/tickets/:id/attachments with a .exe file returns 415 UNSUPPORTED_FILE_TYPE', async () => {
    const exeBuffer = Buffer.from('MZ fake executable');

    const countBefore = await prisma.attachment.count({
      where: { ticketId: testTicket.id },
    });

    const response = await request(app)
      .post(`/api/tickets/${testTicket.id}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', exeBuffer, 'malicious.exe');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      error: 'UNSUPPORTED_FILE_TYPE',
    });

    const countAfter = await prisma.attachment.count({
      where: { ticketId: testTicket.id },
    });
    expect(countAfter).toBe(countBefore);
  });

  it('API-19: POST /api/tickets/:id/attachments with a 6MB file returns 413 FILE_TOO_LARGE', async () => {
    // 6 MB buffer
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);

    const response = await request(app)
      .post(`/api/tickets/${testTicket.id}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', largeBuffer, 'large_diagram.png');

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: 'FILE_TOO_LARGE',
    });
  });

  it('API-20: POST /api/tickets/:id/attachments returns 409 ATTACHMENT_LIMIT_REACHED when 5 active attachments exist', async () => {
    // Create 5 active attachments
    for (let i = 1; i <= 5; i++) {
      await prisma.attachment.create({
        data: {
          ticketId: testTicket.id,
          originalFileName: `file-${i}.png`,
          storedFileName: `file-${i}-uuid.png`,
          mimeType: 'image/png',
          fileSizeBytes: 1024,
          isRemoved: false,
        },
      });
    }

    const pngBuffer = Buffer.from('fake png content');

    const response = await request(app)
      .post(`/api/tickets/${testTicket.id}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', pngBuffer, 'sixth_file.png');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'ATTACHMENT_LIMIT_REACHED',
    });

    const activeCount = await prisma.attachment.count({
      where: { ticketId: testTicket.id, isRemoved: false },
    });
    expect(activeCount).toBe(5);
  });

  it('API-21: POST /api/tickets/:id/attachments returns 404 TICKET_NOT_FOUND when ticket belongs to another requester', async () => {
    const pngBuffer = Buffer.from('fake png content');

    // Requester B attempts to upload attachment to Requester A's ticket
    const response = await request(app)
      .post(`/api/tickets/${testTicket.id}/attachments`)
      .set('x-requester-id', String(requesterB.id))
      .attach('file', pngBuffer, 'unauthorized_file.png');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'TICKET_NOT_FOUND',
    });
  });
});
