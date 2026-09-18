/**
 * server/tests/lab-03/auth.unit.test.ts
 *
 * Tests: UNIT-01 (BR-07, AC-02)
 * Password complexity validator, exercised without a database connection.
 */

import { describe, it, expect } from 'vitest';
import { validatePasswordComplexity } from '../../src/utils/auth.js';

describe('UNIT-01: Password complexity validator (BR-07)', () => {
  it('rejects a password shorter than 8 characters', () => {
    const result = validatePasswordComplexity('Aa1!');
    expect(result.isValid).toBe(false);
  });

  it('rejects a password missing an uppercase letter', () => {
    const result = validatePasswordComplexity('lowercase1!');
    expect(result.isValid).toBe(false);
  });

  it('rejects a password missing a lowercase letter', () => {
    const result = validatePasswordComplexity('UPPERCASE1!');
    expect(result.isValid).toBe(false);
  });

  it('rejects a password missing a number', () => {
    const result = validatePasswordComplexity('NoNumbers!');
    expect(result.isValid).toBe(false);
  });

  it('rejects a password missing a special character', () => {
    const result = validatePasswordComplexity('NoSpecial123');
    expect(result.isValid).toBe(false);
  });

  it('rejects a non-string password', () => {
    const result = validatePasswordComplexity(undefined);
    expect(result.isValid).toBe(false);
  });

  it('accepts a fully compliant password', () => {
    const result = validatePasswordComplexity('SecureNewPassword456!');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
