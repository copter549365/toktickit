// Base URL for API calls. Unset (local `npm run dev`) → the local API on :3000.
// Empty string (the production image, Lab 5) → same-origin relative calls, because the Express
// server serves this SPA and the API from one Cloud Run URL. `??` keeps "" instead of replacing it.
export function resolveApiUrl(raw: string | undefined): string {
  return (raw ?? 'http://localhost:3000').replace(/\/$/, '');
}

export const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL);
