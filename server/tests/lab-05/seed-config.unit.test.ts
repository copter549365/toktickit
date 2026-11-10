/**
 * server/tests/lab-05/seed-config.unit.test.ts
 *
 * Lab 5 Issue 2 (#78) — the seed is safe for production (Student Guide Ep 2 §2.2 point 2):
 *   SC-01  In production the first administrator's password comes only from ADMIN_PASSWORD;
 *          the seed refuses to run without it instead of falling back to a password in code.
 *   SC-02  Demo users and sample tickets are off by default in production and on by default
 *          locally; SEED_DEMO_DATA overrides either way.
 *   SC-03  When demo data is seeded in production its password comes only from
 *          DEMO_USER_PASSWORD.
 *   SC-04  Locally (not production) the documented Lab 3 initial password stays the default, so
 *          Lab 1–4 tests and E2E keep working with no extra setup.
 *   SC-05  A supplied password must satisfy BR-07, or the seeded account could never be used.
 */

import { describe, it, expect } from 'vitest';
import { resolveSeedConfig, LOCAL_DEFAULT_PASSWORD } from '../../src/utils/seedConfig.js';

const STRONG_ADMIN = 'Gener4tedAdmin!x';
const STRONG_DEMO = 'Gener4tedDemo!y';

describe('SC-01: production admin password', () => {
  it('uses ADMIN_PASSWORD in production', () => {
    const config = resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: STRONG_ADMIN });
    expect(config.adminPassword).toBe(STRONG_ADMIN);
  });

  it('refuses to seed in production when ADMIN_PASSWORD is missing or blank', () => {
    expect(() => resolveSeedConfig({ NODE_ENV: 'production' })).toThrow(/ADMIN_PASSWORD/);
    expect(() => resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: '   ' })).toThrow(/ADMIN_PASSWORD/);
  });

  it('never falls back to the local default password in production', () => {
    const config = resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: STRONG_ADMIN });
    expect(config.adminPassword).not.toBe(LOCAL_DEFAULT_PASSWORD);
  });
});

describe('SC-02: demo data switch', () => {
  it('is off by default in production', () => {
    const config = resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: STRONG_ADMIN });
    expect(config.seedDemoData).toBe(false);
    expect(config.demoPassword).toBeNull();
  });

  it('is on by default locally', () => {
    expect(resolveSeedConfig({}).seedDemoData).toBe(true);
    expect(resolveSeedConfig({ NODE_ENV: 'development' }).seedDemoData).toBe(true);
  });

  it('follows SEED_DEMO_DATA when it is set', () => {
    expect(resolveSeedConfig({ SEED_DEMO_DATA: 'false' }).seedDemoData).toBe(false);
    expect(
      resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: STRONG_ADMIN, SEED_DEMO_DATA: 'true', DEMO_USER_PASSWORD: STRONG_DEMO }).seedDemoData,
    ).toBe(true);
  });

  it('rejects a SEED_DEMO_DATA value that is not true or false', () => {
    expect(() => resolveSeedConfig({ SEED_DEMO_DATA: 'yes' })).toThrow(/SEED_DEMO_DATA/);
  });
});

describe('SC-03: production demo password', () => {
  it('uses DEMO_USER_PASSWORD for demo users in production', () => {
    const config = resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: STRONG_ADMIN, SEED_DEMO_DATA: 'true', DEMO_USER_PASSWORD: STRONG_DEMO });
    expect(config.demoPassword).toBe(STRONG_DEMO);
  });

  it('refuses demo data in production without DEMO_USER_PASSWORD', () => {
    expect(() => resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: STRONG_ADMIN, SEED_DEMO_DATA: 'true' })).toThrow(/DEMO_USER_PASSWORD/);
  });
});

describe('SC-04: local defaults keep Lab 1–4 behaviour', () => {
  it('uses the documented Lab 3 initial password when nothing is set', () => {
    const config = resolveSeedConfig({});
    expect(LOCAL_DEFAULT_PASSWORD).toBe('InitialPassword123!');
    expect(config.adminPassword).toBe(LOCAL_DEFAULT_PASSWORD);
    expect(config.demoPassword).toBe(LOCAL_DEFAULT_PASSWORD);
  });

  it('still honours ADMIN_PASSWORD and DEMO_USER_PASSWORD locally when they are set', () => {
    const config = resolveSeedConfig({ ADMIN_PASSWORD: STRONG_ADMIN, DEMO_USER_PASSWORD: STRONG_DEMO });
    expect(config.adminPassword).toBe(STRONG_ADMIN);
    expect(config.demoPassword).toBe(STRONG_DEMO);
  });
});

describe('SC-05: supplied passwords must meet BR-07', () => {
  it('rejects a weak ADMIN_PASSWORD', () => {
    expect(() => resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: 'weak' })).toThrow(/ADMIN_PASSWORD/);
  });

  it('rejects a weak DEMO_USER_PASSWORD', () => {
    expect(() =>
      resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: STRONG_ADMIN, SEED_DEMO_DATA: 'true', DEMO_USER_PASSWORD: 'password' }),
    ).toThrow(/DEMO_USER_PASSWORD/);
  });

  it('never puts the rejected password value in the error message', () => {
    try {
      resolveSeedConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: 'weak-secret-value' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('weak-secret-value');
    }
  });
});
