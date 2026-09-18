/**
 * server/tests/lab-03/users-admin.api.test.ts
 *
 * Tests: API-25..API-30, API-32, API-33 (docs/lab-03/tests.md §2)
 * Administrator User Management: GET/POST /api/admin/users, PATCH /api/admin/users/:id,
 * POST /api/admin/users/:id/reset-password, and the BR-16..BR-20 safety rules.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const PASSWORD = 'UsersAdminTestPassword456!';
const EMAIL_ADMIN = 'users-admin-tester@toktickit.com';
const EMAIL_ADMIN_2 = 'users-admin-tester-2@toktickit.com';
const EMAIL_STAFF = 'users-admin-it-staff@toktickit.com';
const EMAIL_REQUESTER = 'users-admin-requester@toktickit.com';

let admin: { id: number; email: string };
let admin2: { id: number; email: string };
let staff: { id: number; email: string };
let requester: { id: number; email: string };
let cookieAdmin: string;
let cookieAdmin2: string;
let cookieStaff: string;
let cookieRequester: string;
const createdUserIds: number[] = [];

function sessionCookieFor(user: { id: number; email: string }, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'): string {
  const token = signSessionToken({ userId: user.id, email: user.email, role, mustChangePassword: false });
  return `toktickit_session=${token}`;
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const a1 = await prisma.user.upsert({
    where: { email: EMAIL_ADMIN },
    update: { passwordHash, mustChangePassword: true, isActive: true, role: 'ADMINISTRATOR' },
    create: { name: 'Users Admin Tester', email: EMAIL_ADMIN, passwordHash, role: 'ADMINISTRATOR', isActive: true, mustChangePassword: true },
  });
  const a2 = await prisma.user.upsert({
    where: { email: EMAIL_ADMIN_2 },
    update: { passwordHash, mustChangePassword: true, isActive: true, role: 'ADMINISTRATOR' },
    create: { name: 'Users Admin Tester Two', email: EMAIL_ADMIN_2, passwordHash, role: 'ADMINISTRATOR', isActive: true, mustChangePassword: true },
  });
  const s = await prisma.user.upsert({
    where: { email: EMAIL_STAFF },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Users Admin IT Staff', email: EMAIL_STAFF, passwordHash, role: 'IT_STAFF', isActive: true, mustChangePassword: true },
  });
  const r = await prisma.user.upsert({
    where: { email: EMAIL_REQUESTER },
    update: { passwordHash, mustChangePassword: true, isActive: true },
    create: { name: 'Users Admin Requester', email: EMAIL_REQUESTER, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: true },
  });
  admin = { id: a1.id, email: a1.email };
  admin2 = { id: a2.id, email: a2.email };
  staff = { id: s.id, email: s.email };
  requester = { id: r.id, email: r.email };

  cookieAdmin = sessionCookieFor(admin, 'ADMINISTRATOR');
  cookieAdmin2 = sessionCookieFor(admin2, 'ADMINISTRATOR');
  cookieStaff = sessionCookieFor(staff, 'IT_STAFF');
  cookieRequester = sessionCookieFor(requester, 'REQUESTER');
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.user.deleteMany({
    where: { email: { in: [EMAIL_ADMIN, EMAIL_ADMIN_2, EMAIL_STAFF, EMAIL_REQUESTER] } },
  });
  await prisma.$disconnect();
});

describe('API-25: Non-Administrator access to Admin APIs (AC-14)', () => {
  it('rejects an IT Staff session with 403', async () => {
    const response = await request(app).get('/api/admin/users').set('Cookie', cookieStaff);
    expect(response.status).toBe(403);
  });

  it('rejects a Requester session with 403', async () => {
    const response = await request(app).get('/api/admin/users').set('Cookie', cookieRequester);
    expect(response.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await request(app).get('/api/admin/users');
    expect(response.status).toBe(401);
  });
});

describe('API-26: POST /api/admin/users (AC-10, FR-23)', () => {
  it('creates a user with mustChangePassword=true and the specified role', async () => {
    const email = `new-it-staff-${Date.now()}@toktickit.com`;
    const response = await request(app)
      .post('/api/admin/users')
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ name: 'New Staff Member', email, role: 'IT_STAFF', isActive: true, initialPassword: 'InitialPassword123!' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({ name: 'New Staff Member', email, role: 'IT_STAFF', mustChangePassword: true }),
    );
    expect(response.body.passwordHash).toBeUndefined();
    createdUserIds.push(response.body.id);

    // The new user can actually authenticate with the initial password.
    const login = await request(app).post('/api/auth/login').set(JSON_HEADERS).send({ email, password: 'InitialPassword123!' });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('rejects a weak initial password', async () => {
    const response = await request(app)
      .post('/api/admin/users')
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ name: 'Weak Password User', email: `weak-${Date.now()}@toktickit.com`, role: 'REQUESTER', initialPassword: 'weak' });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty('initialPassword');
  });
});

describe('API-27: Duplicate email rejection (AC-11, BR-17)', () => {
  it('rejects creating a user with an email that already exists (case-insensitive)', async () => {
    const response = await request(app)
      .post('/api/admin/users')
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({
        name: 'Duplicate Email User',
        email: EMAIL_STAFF.toUpperCase(),
        role: 'REQUESTER',
        initialPassword: 'InitialPassword123!',
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rejects updating a user to an email that already exists', async () => {
    const response = await request(app)
      .patch(`/api/admin/users/${requester.id}`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ email: EMAIL_STAFF });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('EMAIL_ALREADY_EXISTS');
  });
});

describe('API-28: Self-deactivation prevention (AC-12, BR-18)', () => {
  it('rejects an Administrator deactivating their own account', async () => {
    const response = await request(app)
      .patch(`/api/admin/users/${admin.id}`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('SELF_DEACTIVATION_PROHIBITED');

    const saved = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(saved?.isActive).toBe(true);
  });
});

describe('API-29: Last active Administrator protection (AC-13, BR-19)', () => {
  // Isolated per-test: deactivate every OTHER active Administrator in the (shared) database
  // directly (bypassing the API — this DB may already have seeded admins) so `admin2` is
  // provably the sole remaining active Administrator, then act as `admin` (its session JWT
  // still decodes fine even though its DB row is now inactive — requireAuth only reads the
  // token) against `admin2` as the *target*. Acting user !== target user, so this exercises
  // BR-19 on its own, independent of the BR-18 self-deactivation rule.
  async function isolateAsSoleActiveAdmin(): Promise<number[]> {
    const others = await prisma.user.findMany({
      where: { role: 'ADMINISTRATOR', isActive: true, id: { not: admin2.id } },
      select: { id: true },
    });
    const otherIds = others.map((u) => u.id);
    if (otherIds.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: false } });
    }
    return otherIds;
  }

  async function restoreActiveAdmins(ids: number[]): Promise<void> {
    if (ids.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: true } });
    }
  }

  it('rejects deactivating the last remaining active Administrator', async () => {
    const deactivatedIds = await isolateAsSoleActiveAdmin();

    const response = await request(app)
      .patch(`/api/admin/users/${admin2.id}`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('LAST_ADMIN_PROTECTION');

    const saved = await prisma.user.findUnique({ where: { id: admin2.id } });
    expect(saved?.isActive).toBe(true);

    await restoreActiveAdmins(deactivatedIds);
  });

  it('rejects demoting the last remaining active Administrator away from ADMINISTRATOR', async () => {
    const deactivatedIds = await isolateAsSoleActiveAdmin();

    const response = await request(app)
      .patch(`/api/admin/users/${admin2.id}`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ role: 'IT_STAFF' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('LAST_ADMIN_PROTECTION');

    const saved = await prisma.user.findUnique({ where: { id: admin2.id } });
    expect(saved?.role).toBe('ADMINISTRATOR');

    await restoreActiveAdmins(deactivatedIds);
  });
});

describe('API-30: POST /api/admin/users/:id/reset-password (FR-25, BR-09)', () => {
  it('updates the password hash and sets mustChangePassword=true', async () => {
    const response = await request(app)
      .post(`/api/admin/users/${requester.id}/reset-password`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ newInitialPassword: 'BrandNewTemp789!' });

    expect(response.status).toBe(200);

    const saved = await prisma.user.findUnique({ where: { id: requester.id } });
    expect(saved?.mustChangePassword).toBe(true);
    const matches = await bcrypt.compare('BrandNewTemp789!', saved!.passwordHash);
    expect(matches).toBe(true);
  });

  it('rejects a weak new initial password', async () => {
    const response = await request(app)
      .post(`/api/admin/users/${requester.id}/reset-password`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ newInitialPassword: 'weak' });

    expect(response.status).toBe(400);
  });
});

describe('API-32: Search and role filter (AC-16, FR-22)', () => {
  it('returns only users matching the search term', async () => {
    const response = await request(app)
      .get('/api/admin/users')
      .set('Cookie', cookieAdmin)
      .query({ search: 'Users Admin IT Staff' });

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
    for (const u of response.body) {
      expect(u.name.toLowerCase()).toContain('users admin it staff');
    }
  });

  it('returns only users matching the role filter', async () => {
    const response = await request(app).get('/api/admin/users').set('Cookie', cookieAdmin).query({ role: 'IT_STAFF' });

    expect(response.status).toBe(200);
    for (const u of response.body) {
      expect(u.role).toBe('IT_STAFF');
    }
    expect(response.body.some((u: { id: number }) => u.id === staff.id)).toBe(true);
  });
});

describe('API-33: PATCH /api/admin/users/:id updates (AC-17, FR-24)', () => {
  it('updates name, email, role, and active status together', async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const target = await prisma.user.create({
      data: {
        name: 'Update Target',
        email: `update-target-${Date.now()}@toktickit.com`,
        passwordHash,
        role: 'REQUESTER',
        isActive: true,
        mustChangePassword: true,
      },
    });
    createdUserIds.push(target.id);

    const newEmail = `updated-${Date.now()}@toktickit.com`;
    const response = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set(JSON_HEADERS)
      .set('Cookie', cookieAdmin)
      .send({ name: 'Updated Name', email: newEmail, role: 'IT_STAFF', isActive: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({ name: 'Updated Name', email: newEmail, role: 'IT_STAFF', isActive: false }),
    );
  });
});
