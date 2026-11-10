/**
 * server/tests/lab-05/cloud-ready.api.test.ts
 *
 * Lab 5 Issue 2 (#78) — the app must not depend on anything that lives only inside the
 * container (Student Guide Ep 2, handout R-02/R-04):
 *   CR-01  GET /api/ready reports database connectivity (200 connected / 503 not ready),
 *          because the post-deploy smoke test reads its `db` field.
 *   CR-02  Uploaded attachment bytes are stored in the database (AttachmentContent), never on
 *          the container disk, and download returns the identical bytes.
 *   CR-03  In production the Express server can serve the built SPA (one image, one origin)
 *          without swallowing unknown /api routes.
 *
 * A disposable Requester fixture is used and deleted in afterAll; vitest runs files
 * sequentially (server/vitest.config.ts), so the whole-table seed checks never observe it.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import app, { registerClientApp } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { signSessionToken } from '../../src/utils/auth.js';
import { getAttachmentFilePath } from '../../src/utils/attachmentStorage.js';

const EMAIL = 'lab5-cloud-ready-requester@toktickit.com';
let requester: { id: number; email: string };
let cookie: string;
let ticketId: number;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('CloudReady456!', 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, mustChangePassword: false, isActive: true },
    create: { name: 'Lab 5 Cloud Ready Requester', email: EMAIL, passwordHash, role: 'REQUESTER', isActive: true, mustChangePassword: false },
  });
  requester = { id: user.id, email: user.email };
  const token = signSessionToken({ userId: user.id, email: user.email, role: 'REQUESTER', mustChangePassword: false });
  cookie = `toktickit_session=${token}`;

  const category = (await prisma.category.findFirst())!;
  const relatedSystem = (await prisma.relatedSystem.findFirst({ where: { isActive: true } }))!;
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-1995-${String(Math.floor(Math.random() * 900000) + 100000)}`,
      requesterId: requester.id,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: 'Lab 5 attachment persistence fixture',
      description: 'Fixture ticket for the Lab 5 attachment-in-database tests.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      currentStatus: 'NEW',
    },
  });
  ticketId = ticket.id;
});

afterAll(async () => {
  await prisma.attachment.deleteMany({ where: { ticketId } });
  await prisma.ticket.deleteMany({ where: { id: ticketId } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

describe('CR-01: GET /api/ready reports database connectivity', () => {
  it('returns 200 with db "connected" when the database answers', async () => {
    const response = await request(app).get('/api/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', db: 'connected' });
  });

  it('returns 503 with db "disconnected" when the database query fails', async () => {
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    try {
      const response = await request(app).get('/api/ready');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: 'not_ready', db: 'disconnected' });
    } finally {
      spy.mockRestore();
    }
  });

  it('needs no session (the smoke test calls it anonymously)', async () => {
    const response = await request(app).get('/api/ready');
    expect(response.status).not.toBe(401);
  });
});

describe('CR-02: attachment bytes live in the database, not on the container disk', () => {
  // A small but non-trivial PNG-signature payload with every byte value, so any text
  // re-encoding of the binary column would be caught.
  const fileBuffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  ]);

  it('stores the uploaded bytes in AttachmentContent and writes nothing to uploads/', async () => {
    const upload = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookie)
      .attach('file', fileBuffer, 'diagram.png');
    expect(upload.status).toBe(201);

    const attachment = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
    expect(attachment).not.toBeNull();
    expect(fs.existsSync(getAttachmentFilePath(attachment!.storedFileName))).toBe(false);

    const content = await prisma.attachmentContent.findUnique({ where: { attachmentId: upload.body.id } });
    expect(content).not.toBeNull();
    expect(Buffer.compare(Buffer.from(content!.data), fileBuffer)).toBe(0);
  });

  it('downloads the identical bytes from the database', async () => {
    const upload = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookie)
      .attach('file', fileBuffer, 'diagram-2.png');
    expect(upload.status).toBe(201);

    const download = await request(app)
      .get(`/api/attachments/${upload.body.id}/download`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('image/png');
    expect(download.headers['content-disposition']).toBe('attachment; filename="diagram-2.png"');
    expect(Buffer.compare(download.body as Buffer, fileBuffer)).toBe(0);
  });

  it('deleting an attachment row also deletes its stored bytes (no orphaned content)', async () => {
    const upload = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookie)
      .attach('file', fileBuffer, 'diagram-3.png');
    expect(upload.status).toBe(201);

    await prisma.attachment.delete({ where: { id: upload.body.id } });
    const content = await prisma.attachmentContent.findUnique({ where: { attachmentId: upload.body.id } });
    expect(content).toBeNull();
  });
});

describe('CR-03: the API server can serve the built SPA from one origin', () => {
  let clientDir: string;
  let spaApp: express.Express;

  beforeAll(() => {
    clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toktickit-spa-'));
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><html><body>TokTickIT SPA</body></html>');
    fs.mkdirSync(path.join(clientDir, 'assets'));
    fs.writeFileSync(path.join(clientDir, 'assets', 'app.js'), 'console.log("app");');

    spaApp = express();
    spaApp.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
    registerClientApp(spaApp, clientDir);
  });

  afterAll(() => {
    fs.rmSync(clientDir, { recursive: true, force: true });
  });

  it('serves index.html at /', async () => {
    const response = await request(spaApp).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('TokTickIT SPA');
  });

  it('serves built static assets', async () => {
    const response = await request(spaApp).get('/assets/app.js');
    expect(response.status).toBe(200);
    expect(response.text).toContain('console.log');
  });

  it('falls back to index.html for client-side routes such as /tickets/12', async () => {
    const response = await request(spaApp).get('/tickets/12');
    expect(response.status).toBe(200);
    expect(response.text).toContain('TokTickIT SPA');
  });

  it('still lets API routes answer, and does not turn unknown /api paths into HTML', async () => {
    const health = await request(spaApp).get('/api/health');
    expect(health.body).toEqual({ status: 'ok' });

    const unknown = await request(spaApp).get('/api/does-not-exist');
    expect(unknown.status).toBe(404);
    expect(unknown.text).not.toContain('TokTickIT SPA');
  });

  it('does nothing when the build folder is missing (local development)', async () => {
    const devApp = express();
    registerClientApp(devApp, path.join(clientDir, 'missing'));
    const response = await request(devApp).get('/');
    expect(response.status).toBe(404);
  });
});
