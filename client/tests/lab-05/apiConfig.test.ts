/**
 * client/tests/lab-05/apiConfig.test.ts
 *
 * Lab 5 Issue 2 (#78): on Cloud Run the built SPA and the API share one origin, so the production
 * image is built with VITE_API_URL="" and every request must stay relative (/api/...). The old
 * `|| 'http://localhost:3000'` fallback turned that empty string back into localhost.
 */

import { describe, it, expect } from 'vitest';
import { resolveApiUrl } from '../../src/api/config';

describe('resolveApiUrl', () => {
  it('keeps an empty VITE_API_URL empty so production calls stay same-origin', () => {
    expect(resolveApiUrl('')).toBe('');
  });

  it('uses the local API when VITE_API_URL is not set (npm run dev)', () => {
    expect(resolveApiUrl(undefined)).toBe('http://localhost:3000');
  });

  it('uses an explicit VITE_API_URL as given', () => {
    expect(resolveApiUrl('https://api.example.test')).toBe('https://api.example.test');
  });

  it('drops a trailing slash so `${API_URL}/api/...` never doubles it', () => {
    expect(resolveApiUrl('https://api.example.test/')).toBe('https://api.example.test');
  });
});
