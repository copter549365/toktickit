import { describe, it, expect } from 'vitest';
import {
  validateSummary,
  validateDescription,
  validatePriority,
  validateTicketInputFields,
} from '../../src/utils/validation.js';

describe('UNIT-02: Validation Helpers (BR-11, BR-12, BR-13, BR-14)', () => {
  describe('Summary Validator (BR-11)', () => {
    it('accepts boundary lengths 5 and 120 characters after trimming', () => {
      const minLengthSummary = 'abcde';
      const maxLengthSummary = 'a'.repeat(120);

      expect(validateSummary(minLengthSummary).isValid).toBe(true);
      expect(validateSummary(maxLengthSummary).isValid).toBe(true);
      expect(validateSummary('  ' + minLengthSummary + '  ').trimmed).toBe(minLengthSummary);
    });

    it('rejects summary shorter than 5 characters after trimming', () => {
      expect(validateSummary('abcd').isValid).toBe(false);
      expect(validateSummary('   abc   ').isValid).toBe(false);
      expect(validateSummary('').isValid).toBe(false);
      expect(validateSummary('    ').isValid).toBe(false);
    });

    it('rejects summary longer than 120 characters after trimming', () => {
      expect(validateSummary('a'.repeat(121)).isValid).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validateSummary(null).isValid).toBe(false);
      expect(validateSummary(undefined).isValid).toBe(false);
      expect(validateSummary(12345).isValid).toBe(false);
    });
  });

  describe('Description Validator (BR-12)', () => {
    it('accepts boundary lengths 10 and 2000 characters after trimming', () => {
      const minLengthDesc = '1234567890';
      const maxLengthDesc = 'a'.repeat(2000);

      expect(validateDescription(minLengthDesc).isValid).toBe(true);
      expect(validateDescription(maxLengthDesc).isValid).toBe(true);
      expect(validateDescription('  ' + minLengthDesc + '  ').trimmed).toBe(minLengthDesc);
    });

    it('rejects description shorter than 10 characters after trimming', () => {
      expect(validateDescription('123456789').isValid).toBe(false);
      expect(validateDescription('   123456789   ').isValid).toBe(false);
      expect(validateDescription('').isValid).toBe(false);
      expect(validateDescription('    ').isValid).toBe(false);
    });

    it('rejects description longer than 2000 characters after trimming', () => {
      expect(validateDescription('a'.repeat(2001)).isValid).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validateDescription(null).isValid).toBe(false);
      expect(validateDescription(undefined).isValid).toBe(false);
    });
  });

  describe('Priority Validator (BR-14)', () => {
    it('accepts LOW, MEDIUM, HIGH', () => {
      expect(validatePriority('LOW').isValid).toBe(true);
      expect(validatePriority('MEDIUM').isValid).toBe(true);
      expect(validatePriority('HIGH').isValid).toBe(true);
    });

    it('rejects invalid priority strings or types', () => {
      expect(validatePriority('URGENT').isValid).toBe(false);
      expect(validatePriority('').isValid).toBe(false);
      expect(validatePriority(null).isValid).toBe(false);
    });
  });

  describe('validateTicketInputFields', () => {
    it('returns isValid true when all fields are valid', () => {
      const result = validateTicketInputFields({
        categoryId: 2,
        relatedSystemId: 6,
        summary: 'Cannot connect to company VPN',
        description: 'Every time I try to connect to the VPN it throws error 403.',
        requestedPriority: 'HIGH',
      });

      expect(result.isValid).toBe(true);
      expect(Object.keys(result.fieldErrors)).toHaveLength(0);
      expect(result.trimmedSummary).toBe('Cannot connect to company VPN');
    });

    it('collects all field errors when multiple fields are invalid', () => {
      const result = validateTicketInputFields({
        summary: 'shrt',
        description: 'short',
        requestedPriority: 'INVALID',
      });

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.summary).toBeDefined();
      expect(result.fieldErrors.description).toBeDefined();
      expect(result.fieldErrors.categoryId).toBeDefined();
      expect(result.fieldErrors.relatedSystemId).toBeDefined();
      expect(result.fieldErrors.requestedPriority).toBeDefined();
    });
  });
});
