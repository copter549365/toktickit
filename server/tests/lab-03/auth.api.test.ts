/**
 * server/tests/lab-03/auth.api.test.ts
 *
 * Tests: API-01 .. API-07 (docs/lab-03/tests.md §2)
 * Runs against the real seeded Postgres test database (see server/tests/lab-03/migration.test.ts
 * prerequisites: `npx prisma migrate deploy` then `npx tsx prisma/seed.ts`).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import app, { requireAuth, requirePasswordChangeCompleted } from '../../src/app.js';
import { prisma } from '../../src/db.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const INITIAL_PASSWORD = 'InitialPassword123!';

// A dedicated, disposable test user isolated from the shared seed fixtures — API-06/API-07
// mutate password state, so reusing a seeded fixture (e.g. jennifer.anderson@toktickit.com)
// would leak into other suites (server/tests/lab-03/migration.test.ts asserts her password
// still matches InitialPassword123!).
const TEST_EMAIL = 'auth-api-test-user@toktickit.com';
let testUserId: number;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: {
      name: 'Auth Api Test User',
      email: TEST_EMAIL,
      passwordHash,
      role: 'REQUESTER',
      isActive: true,
      mustChangePassword: true,
    },
  });
  testUserId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

function extractSessionCookie(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const sessionCookie = cookies.find((c) => c.startsWith('toktickit_session='));
  expect(sessionCookie).toBeDefined();
  return sessionCookie!.split(';')[0];
}

describe('API-01: POST /api/auth/login — valid credentials', () => {
  it('returns 200, sets the session cookie, and returns safe user data (no password hash)', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        id: testUserId,
        email: TEST_EMAIL,
        role: 'REQUESTER',
        mustChangePassword: true,
      }),
    );
    expect(response.body.user.passwordHash).toBeUndefined();
    extractSessionCookie(response);
  });

  it('rejects a request missing the CSRF client header', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });

    expect(response.status).toBe(400);
  });
});

describe('API-02: POST /api/auth/login — invalid password (BR-01)', () => {
  it('returns 401 with a generic error message and no session cookie', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: TEST_EMAIL, password: 'WrongPassword123!' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('INVALID_CREDENTIALS');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});

describe('API-03: POST /api/auth/login — inactive account (BR-01)', () => {
  it('returns 401 with a safe error message and blocks login', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: 'robert.wilson@toktickit.com', password: INITIAL_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('ACCOUNT_INACTIVE');
  });
});

describe('API-04: POST /api/auth/logout', () => {
  it('returns 200 and clears the session cookie', async () => {
    const response = await request(app).post('/api/auth/logout').set(JSON_HEADERS).send();

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/logged out/i);
    const raw = response.headers['set-cookie'];
    const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const cleared = cookies.find((c) => c.startsWith('toktickit_session='));
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/toktickit_session=;/);
  });
});

describe('API-05: GET /api/auth/me', () => {
  it('returns the authenticated user profile and role when a valid session cookie is sent', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
    const cookie = extractSessionCookie(loginResponse);

    const meResponse = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user).toEqual(
      expect.objectContaining({ id: testUserId, email: TEST_EMAIL, role: 'REQUESTER' }),
    );
  });

  it('returns 401 when no session cookie is present', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('MISSING_OR_INVALID_TOKEN');
  });
});

describe('API-06: requirePasswordChangeCompleted blocks users flagged mustChangePassword (BR-02)', () => {
  // Issue 3 introduces requireAuth/requirePasswordChangeCompleted as the reusable middleware
  // pair defined by api-spec.md §0.2. No other protected business endpoint exists yet in this
  // issue (later issues wire it onto the staff/admin/ticket routes) — so its gating contract is
  // verified here against a purpose-built protected route mounted on a throwaway Express app,
  // exercising the exact exported middleware functions the real app.ts routes will reuse.
  const protectedApp = express();
  protectedApp.use(cookieParser());
  protectedApp.get('/api/_protected-test', requireAuth, requirePasswordChangeCompleted, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  it('blocks a user with mustChangePassword=true from a normal protected endpoint', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
    const cookie = extractSessionCookie(loginResponse);
    expect(loginResponse.body.user.mustChangePassword).toBe(true);

    const response = await request(protectedApp).get('/api/_protected-test').set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('allows a user with mustChangePassword=false through the same protected endpoint', async () => {
    const activeUser = await prisma.user.findFirst({
      where: { email: 'jennifer.anderson@toktickit.com' },
    });
    expect(activeUser).not.toBeNull();

    // Sign in as a user whose mustChangePassword is already false to prove the gate opens.
    await prisma.user.update({ where: { id: activeUser!.id }, data: { mustChangePassword: false } });
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: activeUser!.email, password: INITIAL_PASSWORD });
    const cookie = extractSessionCookie(loginResponse);

    const response = await request(protectedApp).get('/api/_protected-test').set('Cookie', cookie);
    expect(response.status).toBe(200);

    // Restore the shared seed fixture's flag so other suites are unaffected.
    await prisma.user.update({ where: { id: activeUser!.id }, data: { mustChangePassword: true } });
  });
});

describe('API-07: POST /api/auth/change-password (AC-02, FR-04)', () => {
  const NEW_PASSWORD = 'SecureNewPassword456!';

  it('updates the password hash, clears mustChangePassword, and reissues the session cookie', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
    const cookie = extractSessionCookie(loginResponse);

    const response = await request(app)
      .post('/api/auth/change-password')
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({
        currentPassword: INITIAL_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(false);
    extractSessionCookie(response);

    const persisted = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(persisted?.mustChangePassword).toBe(false);
    const matchesNew = await bcrypt.compare(NEW_PASSWORD, persisted!.passwordHash);
    expect(matchesNew).toBe(true);
  });

  it('rejects a mismatched confirmPassword', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: TEST_EMAIL, password: NEW_PASSWORD });
    const cookie = extractSessionCookie(loginResponse);

    const response = await request(app)
      .post('/api/auth/change-password')
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({
        currentPassword: NEW_PASSWORD,
        newPassword: 'AnotherPassword789!',
        confirmPassword: 'Mismatch987!',
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty('confirmPassword');
  });

  it('rejects an incorrect currentPassword', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: TEST_EMAIL, password: NEW_PASSWORD });
    const cookie = extractSessionCookie(loginResponse);

    const response = await request(app)
      .post('/api/auth/change-password')
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({
        currentPassword: 'NotTheCurrentPassword1!',
        newPassword: 'AnotherPassword789!',
        confirmPassword: 'AnotherPassword789!',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('rejects a password that fails BR-07 complexity rules', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(JSON_HEADERS)
      .send({ email: TEST_EMAIL, password: NEW_PASSWORD });
    const cookie = extractSessionCookie(loginResponse);

    const response = await request(app)
      .post('/api/auth/change-password')
      .set(JSON_HEADERS)
      .set('Cookie', cookie)
      .send({
        currentPassword: NEW_PASSWORD,
        newPassword: 'weak',
        confirmPassword: 'weak',
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty('newPassword');
  });
});
