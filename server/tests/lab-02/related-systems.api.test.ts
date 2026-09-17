import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('API-30: Related Systems Endpoint', () => {
  it('GET /api/related-systems returns active related systems ordered by id', async () => {
    const response = await request(app).get('/api/related-systems');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(6);

    for (const item of response.body) {
      expect(item).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          name: expect.any(String),
        }),
      );
    }

    const names = response.body.map((r: { name: string }) => r.name);
    expect(names).toContain('Email');
    expect(names).toContain('Campus Wi-Fi');
    expect(names).toContain('VPN');
    expect(names).toContain('Corporate Laptop');
  });

  it('does not require an x-requester-id header (reference-data endpoint)', async () => {
    const response = await request(app).get('/api/related-systems');
    expect(response.status).toBe(200);
  });
});
