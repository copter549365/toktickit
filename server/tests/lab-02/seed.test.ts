import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

afterAll(async () => {
  await prisma.$disconnect();
});

describe('DB-01: Lab 2 Seed Data', () => {
  it('seeds at least 6 unique, active related systems', async () => {
    const relatedSystems = await prisma.relatedSystem.findMany({
      orderBy: { id: 'asc' },
    });

    expect(relatedSystems.length).toBeGreaterThanOrEqual(6);
    expect(relatedSystems.every((system) => system.isActive)).toBe(true);

    const names = relatedSystems.map((system) => system.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('seeds at least 4 active development requesters and at least 1 inactive one', async () => {
    const requesters = await prisma.user.findMany({
      where: { role: 'REQUESTER' },
      orderBy: { id: 'asc' },
    });

    const active = requesters.filter((requester) => requester.isActive);
    const inactive = requesters.filter((requester) => !requester.isActive);

    expect(active.length).toBeGreaterThanOrEqual(4);
    expect(inactive.length).toBeGreaterThanOrEqual(1);

    const emails = requesters.map((requester) => requester.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('running the seed again does not duplicate related systems or requesters (idempotent)', async () => {
    const [beforeSystems, beforeRequesters] = await Promise.all([
      prisma.relatedSystem.count(),
      prisma.user.count({ where: { role: 'REQUESTER' } }),
    ]);

    execSync('npx prisma db seed', { cwd: projectRoot, stdio: 'inherit' });

    const [afterSystems, afterRequesters] = await Promise.all([
      prisma.relatedSystem.count(),
      prisma.user.count({ where: { role: 'REQUESTER' } }),
    ]);

    expect(afterSystems).toBe(beforeSystems);
    expect(afterRequesters).toBe(beforeRequesters);
  });
});
