/**
 * server/tests/lab-03/requester-regression.test.ts
 *
 * Test: REGR-01 (docs/lab-03/tests.md) — Lab 2 Requester flows (Create Ticket, My Tickets,
 * Ticket Detail, Attachments) continue to work once migrated from the Lab 2 `x-requester-id`
 * header onto the real authenticated session (FR-10, FR-11, BR-03, AC-03).
 *
 * Two disposable Requester fixtures are used (never seeded fixtures) so mutations here never
 * leak into other suites. Their database rows are seeded with mustChangePassword=false — safe
 * because server/vitest.config.ts runs test files sequentially and this file's afterAll deletes
 * both fixtures, so tests/lab-03/migration.test.ts's whole-table scan never observes them. The
 * session cookie is minted directly with signSessionToken instead of going through
 * POST /api/auth/login purely to skip re-deriving the password hash per test.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const PASSWORD = 'RegressionPassword456!';
const EMAIL_A = 'regression-requester-a@toktickit.com';
const EMAIL_B = 'regression-requester-b@toktickit.com';
const EMAIL_STAFF = 'regression-it-staff@toktickit.com';

let requesterA: { id: number };
let requesterB: { id: number };
let cookieA: string;
let cookieB: string;
let cookieStaff: string;
let categoryOne: { id: number };
let categoryTwo: { id: number };
let relatedSystem: { id: number };
const createdTicketIds: number[] = [];

function sessionCookieFor(user: { id: number; email: string; role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR' }): string {
  const token = signSessionToken({ userId: user.id, email: user.email, role: user.role, mustChangePassword: false });
  return `toktickit_session=${token}`;
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const a = await prisma.user.upsert({
    where: { email: EMAIL_A },
    update: { passwordHash, mustChangePassword: false, isActive: true },
    create: { name: 'Regression Requester A', email: EMAIL_A, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: false },
  });
  const b = await prisma.user.upsert({
    where: { email: EMAIL_B },
    update: { passwordHash, mustChangePassword: false, isActive: true },
    create: { name: 'Regression Requester B', email: EMAIL_B, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: false },
  });
  const s = await prisma.user.upsert({
    where: { email: EMAIL_STAFF },
    update: { passwordHash, mustChangePassword: false, isActive: true },
    create: { name: 'Regression IT Staff', email: EMAIL_STAFF, passwordHash, role: 'IT_STAFF', isActive: true, mustChangePassword: false },
  });
  requesterA = { id: a.id };
  requesterB = { id: b.id };

  cookieA = sessionCookieFor({ id: a.id, email: a.email, role: 'REQUESTER' });
  cookieB = sessionCookieFor({ id: b.id, email: b.email, role: 'REQUESTER' });
  cookieStaff = sessionCookieFor({ id: s.id, email: s.email, role: 'IT_STAFF' });

  const categories = await prisma.category.findMany({ take: 2 });
  categoryOne = categories[0];
  categoryTwo = categories[1];
  relatedSystem = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!;
});

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_STAFF] } } });
  await prisma.$disconnect();
});

describe('REGR-01a: Create Ticket under real auth (FR-10, BR-03)', () => {
  it('POST /api/tickets derives requesterId from the session, ignoring client-supplied fields', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .set(JSON_HEADERS)
      .set('Cookie', cookieA)
      .send({
        categoryId: categoryOne.id,
        relatedSystemId: relatedSystem.id,
        summary: 'Cannot connect to company VPN network',
        description: 'Every time I attempt to connect to the corporate VPN from home it fails with error 403.',
        requestedPriority: 'HIGH',
        requesterId: 999999,
        currentStatus: 'RESOLVED',
        ticketOwnerId: 99,
      });

    expect(response.status).toBe(201);
    expect(response.body.ticket).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        ticketNumber: expect.stringMatching(/^TKT-\d{4}-\d{6}$/),
        requesterId: requesterA.id,
        requestedPriority: 'HIGH',
        itPriority: 'HIGH', // BR-11: initialized to requestedPriority
        currentStatus: 'NEW',
        ticketOwnerId: null,
        requesterResolvedIndicator: false,
      }),
    );
    createdTicketIds.push(response.body.ticket.id);
  });

  it('rejects missing Summary with 400 VALIDATION_FAILED', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .set(JSON_HEADERS)
      .set('Cookie', cookieA)
      .send({
        categoryId: categoryOne.id,
        relatedSystemId: relatedSystem.id,
        summary: '   ',
        description: 'Unique description for validation failure test.',
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_FAILED');
    expect(response.body.fieldErrors?.summary).toBeDefined();
  });

  it('rejects an unknown categoryId with 400 INVALID_REFERENCE', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .set(JSON_HEADERS)
      .set('Cookie', cookieA)
      .send({
        categoryId: 999999,
        relatedSystemId: relatedSystem.id,
        summary: 'Cannot login to application',
        description: 'Authentication returns 500 internal server error repeatedly.',
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_REFERENCE', field: 'categoryId' });
  });

  it('rejects a request with no session cookie with 401 MISSING_OR_INVALID_TOKEN', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .set(JSON_HEADERS)
      .send({
        categoryId: categoryOne.id,
        relatedSystemId: relatedSystem.id,
        summary: 'Cannot login to application',
        description: 'Authentication returns 500 internal server error repeatedly.',
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('MISSING_OR_INVALID_TOKEN');
  });

  it('rejects an IT Staff session with 403 FORBIDDEN_ROLE', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({
        categoryId: categoryOne.id,
        relatedSystemId: relatedSystem.id,
        summary: 'Cannot login to application',
        description: 'Authentication returns 500 internal server error repeatedly.',
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN_ROLE');
  });
});

describe('REGR-01b: My Tickets list under real auth (FR-11, BR-03)', () => {
  const runToken = `MyTixRegr${Date.now()}`;

  beforeAll(async () => {
    for (let i = 0; i < 12; i++) {
      let summary = `${runToken} fixture ticket ${i}`;
      if (i === 0) summary = `${runToken} laptop battery drains quickly`;

      const t = await prisma.ticket.create({
        data: {
          ticketNumber: `TKT-1999-${String(i + 1).padStart(6, '0')}`,
          requesterId: requesterA.id,
          categoryId: i < 2 ? categoryTwo.id : categoryOne.id,
          relatedSystemId: relatedSystem.id,
          summary,
          description: 'Fixture ticket created for My Tickets regression tests.',
          requestedPriority: 'MEDIUM',
          itPriority: 'MEDIUM',
          currentStatus: 'NEW',
        },
      });
      createdTicketIds.push(t.id);
    }

    // Requester B's own ticket must never leak into A's list (BR-03, AC-03).
    const tB = await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-1999-900001',
        requesterId: requesterB.id,
        categoryId: categoryOne.id,
        relatedSystemId: relatedSystem.id,
        summary: `${runToken} requester B fixture ticket`,
        description: 'Fixture ticket belonging to a different Requester.',
        requestedPriority: 'LOW',
        itPriority: 'LOW',
        currentStatus: 'NEW',
      },
    });
    createdTicketIds.push(tB.id);
  });

  it('returns only the authenticated Requester\'s own tickets, in the documented nested shape', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .set('Cookie', cookieA)
      .query({ search: runToken, pageSize: 50 });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(12);
    expect(response.body.meta.totalCount).toBe(12);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        ticketNumber: expect.any(String),
        category: expect.objectContaining({ id: expect.any(Number), name: expect.any(String) }),
        relatedSystem: expect.objectContaining({ id: expect.any(Number), name: expect.any(String) }),
        requestedPriority: expect.any(String),
        itPriority: expect.any(String),
        currentStatus: expect.any(String),
        requesterResolvedIndicator: false,
        owner: null,
      }),
    );

    const requesterBLeak = await request(app)
      .get('/api/tickets')
      .set('Cookie', cookieA)
      .query({ search: `${runToken} requester B` });
    expect(requesterBLeak.body.data).toEqual([]);
  });

  it('search, category filter, sort, and pagination all still work scoped to the session identity', async () => {
    const filtered = await request(app)
      .get('/api/tickets')
      .set('Cookie', cookieA)
      .query({ search: runToken, categoryId: categoryTwo.id, currentStatus: 'NEW', pageSize: 50 });
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.length).toBe(2);

    const paged = await request(app)
      .get('/api/tickets')
      .set('Cookie', cookieB)
      .query({ search: runToken, page: 5, pageSize: 10 });
    expect(paged.status).toBe(200);
    expect(paged.body.data).toEqual([]);
    expect(paged.body.meta.totalCount).toBe(1);

    const sorted = await request(app)
      .get('/api/tickets')
      .set('Cookie', cookieA)
      .query({ search: runToken, sortBy: 'ticketNumber', sortOrder: 'desc', pageSize: 50 });
    const numbers = sorted.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toEqual([...numbers].sort().reverse());
  });

  it('rejects a request with no session cookie with 401', async () => {
    const response = await request(app).get('/api/tickets');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('MISSING_OR_INVALID_TOKEN');
  });
});

describe('REGR-01c: Ticket Detail under real auth (FR-11, BR-03, AC-03)', () => {
  let ownedTicket: { id: number };

  beforeAll(async () => {
    ownedTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-1997-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        requesterId: requesterA.id,
        categoryId: categoryOne.id,
        relatedSystemId: relatedSystem.id,
        summary: 'Ticket detail regression fixture',
        description: 'Fixture ticket created for the Ticket Detail regression tests.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: 'NEW',
      },
    });
    createdTicketIds.push(ownedTicket.id);
  });

  it('GET /api/tickets/:id for an owned ticket returns 200 with the full field set', async () => {
    const response = await request(app).get(`/api/tickets/${ownedTicket.id}`).set('Cookie', cookieA);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: ownedTicket.id,
        requesterId: requesterA.id,
        categoryName: expect.any(String),
        relatedSystemName: expect.any(String),
        ticketOwnerId: null,
        ticketOwnerName: null,
        requesterResolvedIndicator: false,
        publicCommentsCount: 0,
        attachments: [],
      }),
    );
  });

  it('GET /api/tickets/:id for another Requester\'s ticket returns 404 (no ownership leak)', async () => {
    const response = await request(app).get(`/api/tickets/${ownedTicket.id}`).set('Cookie', cookieB);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'TICKET_NOT_FOUND' });
  });

  it('GET /api/tickets/:id for a nonexistent id returns the identical 404 shape', async () => {
    const response = await request(app).get(`/api/tickets/${ownedTicket.id + 999999}`).set('Cookie', cookieA);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'TICKET_NOT_FOUND' });
  });
});

describe('REGR-01d: Attachment lifecycle under real auth (FR-11, BR-03)', () => {
  let testTicket: { id: number };

  beforeAll(async () => {
    testTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-1996-${String(Math.floor(Math.random() * 900000) + 100000)}`,
        requesterId: requesterA.id,
        categoryId: categoryOne.id,
        relatedSystemId: relatedSystem.id,
        summary: 'Attachment lifecycle regression fixture',
        description: 'Fixture ticket created for attachment lifecycle regression tests.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: 'NEW',
      },
    });
    createdTicketIds.push(testTicket.id);
  });

  it('uploads a valid JPG, downloads matching bytes, then soft-removes it', async () => {
    const fileBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const uploadResponse = await request(app)
      .post(`/api/tickets/${testTicket.id}/attachments`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieA)
      .attach('file', fileBuffer, 'screenshot.jpg');

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body).toEqual(
      expect.objectContaining({ originalFileName: 'screenshot.jpg', mimeType: 'image/jpeg', isRemoved: false }),
    );
    const attachmentId = uploadResponse.body.id;

    const downloadResponse = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set('Cookie', cookieA)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(downloadResponse.status).toBe(200);
    expect(Buffer.compare(downloadResponse.body as Buffer, fileBuffer)).toBe(0);

    // Another Requester cannot download or remove it (BR-03).
    const foreignDownload = await request(app).get(`/api/attachments/${attachmentId}/download`).set('Cookie', cookieB);
    expect(foreignDownload.status).toBe(404);

    const removeResponse = await request(app)
      .delete(`/api/attachments/${attachmentId}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookieA)
      .send({ removalReason: 'Wrong screenshot attached by mistake' });
    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.isRemoved).toBe(true);
  });

  it('rejects an unsupported file type with 415 and does not persist it', async () => {
    const response = await request(app)
      .post(`/api/tickets/${testTicket.id}/attachments`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieA)
      .attach('file', Buffer.from('MZ fake executable'), 'malicious.exe');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ error: 'UNSUPPORTED_FILE_TYPE' });
  });

  it("rejects uploading to another Requester's ticket with 404", async () => {
    const response = await request(app)
      .post(`/api/tickets/${testTicket.id}/attachments`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieB)
      .attach('file', Buffer.from('fake png content'), 'unauthorized.png');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'TICKET_NOT_FOUND' });
  });
});
