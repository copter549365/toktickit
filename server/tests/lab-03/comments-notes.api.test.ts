/**
 * server/tests/lab-03/comments-notes.api.test.ts
 *
 * Tests: API-08, API-09, API-22, API-23, API-24 (docs/lab-03/tests.md §2)
 * Public Comments (BR-04, BR-14, BR-15) and the Internal Notes security boundary (BR-05, AC-04).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const PASSWORD = 'CommentsTestPassword456!';
const EMAIL_REQUESTER = 'comments-requester@toktickit.com';
const EMAIL_STAFF = 'comments-it-staff@toktickit.com';

let requester: { id: number };
let staff: { id: number };
let cookieRequester: string;
let cookieStaff: string;
let ticket: { id: number };

// requireAuth re-reads mustChangePassword from the database on every request (PR #50 review),
// so these fixtures are created with mustChangePassword=false directly rather than forging a
// mismatched JWT claim.
function sessionCookieFor(user: { id: number; email: string; role: 'REQUESTER' | 'IT_STAFF' }): string {
  const token = signSessionToken({ userId: user.id, email: user.email, role: user.role, mustChangePassword: false });
  return `toktickit_session=${token}`;
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const r = await prisma.user.upsert({
    where: { email: EMAIL_REQUESTER },
    update: { passwordHash, mustChangePassword: false, isActive: true },
    create: { name: 'Comments Requester', email: EMAIL_REQUESTER, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: false },
  });
  const s = await prisma.user.upsert({
    where: { email: EMAIL_STAFF },
    update: { passwordHash, mustChangePassword: false, isActive: true },
    create: { name: 'Comments IT Staff', email: EMAIL_STAFF, passwordHash, role: 'IT_STAFF', isActive: true, mustChangePassword: false },
  });
  requester = { id: r.id };
  staff = { id: s.id };

  cookieRequester = sessionCookieFor({ id: r.id, email: r.email, role: 'REQUESTER' });
  cookieStaff = sessionCookieFor({ id: s.id, email: s.email, role: 'IT_STAFF' });

  const category = (await prisma.category.findFirst())!;
  const relatedSystem = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!;
  ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1994-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId: requester.id,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: 'Comments and notes fixture ticket',
      description: 'Fixture ticket created for comments/notes regression tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: 'IN_PROGRESS',
    },
  });
});

afterAll(async () => {
  await prisma.internalNote.deleteMany({ where: { ticketId: ticket.id } });
  await prisma.publicComment.deleteMany({ where: { ticketId: ticket.id } });
  await prisma.ticket.deleteMany({ where: { id: ticket.id } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_REQUESTER, EMAIL_STAFF] } } });
  await prisma.$disconnect();
});

describe('API-22: Public Comments (BR-04, BR-14, BR-15)', () => {
  it('a Requester can post a Public Comment on their own ticket', async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieRequester)
      .send({ content: 'Any update on this issue?' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        content: 'Any update on this issue?',
        author: expect.objectContaining({ id: requester.id, name: expect.any(String), role: 'REQUESTER' }),
      }),
    );
  });

  it('IT Staff can post a Public Comment, and both Requester and Staff can read the full thread', async () => {
    const postResponse = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ content: 'We are investigating this now.' });
    expect(postResponse.status).toBe(201);
    expect(postResponse.body.author.role).toBe('IT_STAFF');

    const listAsRequester = await request(app).get(`/api/tickets/${ticket.id}/comments`).set('Cookie', cookieRequester);
    expect(listAsRequester.status).toBe(200);
    expect(listAsRequester.body.length).toBeGreaterThanOrEqual(2);

    const listAsStaff = await request(app).get(`/api/tickets/${ticket.id}/comments`).set('Cookie', cookieStaff);
    expect(listAsStaff.status).toBe(200);
    expect(listAsStaff.body.length).toBe(listAsRequester.body.length);
  });
});

describe('API-23: Empty/whitespace comment content is rejected (BR-15)', () => {
  it('rejects an empty comment with 400', async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieRequester)
      .send({ content: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects a comment over 2000 characters with 400', async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieRequester)
      .send({ content: 'a'.repeat(2001) });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_FAILED');
  });
});

describe('API-24: IT Staff can create and view Internal Notes (FR-19)', () => {
  it('201 Created; note saved with author details', async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticket.id}/notes`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieStaff)
      .send({ content: 'Escalating to hardware vendor for part replacement.' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        content: 'Escalating to hardware vendor for part replacement.',
        author: expect.objectContaining({ id: staff.id, role: 'IT_STAFF' }),
      }),
    );

    const listResponse = await request(app).get(`/api/tickets/${ticket.id}/notes`).set('Cookie', cookieStaff);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe('API-08/API-09: Internal Notes are strictly hidden from Requesters (BR-05, AC-04)', () => {
  it('GET /api/tickets/:id/notes as Requester returns 403 with no note content', async () => {
    const response = await request(app).get(`/api/tickets/${ticket.id}/notes`).set('Cookie', cookieRequester);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN_ROLE');
    expect(response.body).not.toHaveProperty('content');
    expect(Array.isArray(response.body)).toBe(false);
  });

  it('POST /api/tickets/:id/notes as Requester returns 403 and creates nothing', async () => {
    const countBefore = await prisma.internalNote.count({ where: { ticketId: ticket.id } });

    const response = await request(app)
      .post(`/api/tickets/${ticket.id}/notes`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieRequester)
      .send({ content: 'A Requester should never be able to write this.' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN_ROLE');

    const countAfter = await prisma.internalNote.count({ where: { ticketId: ticket.id } });
    expect(countAfter).toBe(countBefore);
  });
});
