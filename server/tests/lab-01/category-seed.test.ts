import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../src/db.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('DB: Category Seed', () => {
  it('DB-01: Seed inserts the four categories in order', async () => {
    const categories = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
    expect(categories).toEqual([
      { id: 1, name: 'Account and Access' },
      { id: 2, name: 'Hardware' },
      { id: 3, name: 'Software' },
      { id: 4, name: 'Network' },
    ]);
  });

  it('DB-02: Seed run twice creates no duplicates (idempotent)', async () => {
    const categories = await prisma.category.findMany();
    expect(categories).toHaveLength(4);
  });
});
