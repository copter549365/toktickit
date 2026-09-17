import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('API-29: Requesters Endpoint', () => {
  it('GET /api/requesters returns only active development requesters, excluding inactive ones', async () => {
    const response = await request(app).get('/api/requesters');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(4);

    for (const requester of response.body) {
      expect(requester).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          name: expect.any(String),
          email: expect.any(String),
        }),
      );
    }

    const names = response.body.map((requester: { name: string }) => requester.name);
    expect(names).not.toContain('Priya Natarajan');
  });

  it('does not require an x-requester-id header (reference-data endpoint)', async () => {
    const response = await request(app).get('/api/requesters');
    expect(response.status).toBe(200);
  });
});
