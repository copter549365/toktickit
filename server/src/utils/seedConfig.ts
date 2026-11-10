// Lab 5 (Issue 2, Student Guide Ep 2 §2.2 point 2): the seed must be safe to run in production.
// The first administrator's and the demo users' passwords come from the environment
// (Secret Manager on Cloud Run) and are never printed. Only local development falls back to the
// documented Lab 3 initial password (docs/lab-03/specification.md §7.2), so Lab 1–4 tests and
// E2E keep working without extra setup.
import { validatePasswordComplexity } from './auth.js';

export const LOCAL_DEFAULT_PASSWORD = 'InitialPassword123!';

export interface SeedConfig {
  isProduction: boolean;
  seedDemoData: boolean;
  adminPassword: string;
  /** null when demo data is not being seeded. */
  demoPassword: string | null;
}

type SeedEnv = Partial<Record<'NODE_ENV' | 'ADMIN_PASSWORD' | 'DEMO_USER_PASSWORD' | 'SEED_DEMO_DATA', string>>;

function parseSeedDemoData(raw: string | undefined, isProduction: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return !isProduction;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('SEED_DEMO_DATA must be "true" or "false".');
}

function resolvePassword(name: 'ADMIN_PASSWORD' | 'DEMO_USER_PASSWORD', raw: string | undefined, isProduction: boolean): string {
  const value = raw?.trim();
  if (!value) {
    if (isProduction) {
      throw new Error(`${name} must be set when NODE_ENV=production (the seed never uses a password from code in production).`);
    }
    return LOCAL_DEFAULT_PASSWORD;
  }
  // The message names the variable only — never the rejected value.
  if (!validatePasswordComplexity(value).isValid) {
    throw new Error(`${name} does not meet the password rules (BR-07: 8+ characters with upper, lower, number and special).`);
  }
  return value;
}

export function resolveSeedConfig(env: SeedEnv): SeedConfig {
  const isProduction = env.NODE_ENV === 'production';
  const seedDemoData = parseSeedDemoData(env.SEED_DEMO_DATA, isProduction);
  const adminPassword = resolvePassword('ADMIN_PASSWORD', env.ADMIN_PASSWORD, isProduction);
  const demoPassword = seedDemoData ? resolvePassword('DEMO_USER_PASSWORD', env.DEMO_USER_PASSWORD, isProduction) : null;
  return { isProduction, seedDemoData, adminPassword, demoPassword };
}
