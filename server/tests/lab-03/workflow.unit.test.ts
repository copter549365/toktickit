/**
 * server/tests/lab-03/workflow.unit.test.ts
 *
 * Test: UNIT-02 (BR-13, AC-08) — Status transition state machine.
 */

import { describe, it, expect } from 'vitest';
import {
  isValidStaffStatusTransition,
  getPermittedNextStatuses,
  validateStatusChangeFields,
} from '../../src/utils/statusTransition.js';

describe('UNIT-02: Status transition state machine (BR-13)', () => {
  it('permits every documented IT Staff / Administrator transition', () => {
    expect(isValidStaffStatusTransition('NEW', 'OPEN')).toBe(true);
    expect(isValidStaffStatusTransition('NEW', 'IN_PROGRESS')).toBe(true);
    expect(isValidStaffStatusTransition('NEW', 'CANCELLED')).toBe(true);
    expect(isValidStaffStatusTransition('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(isValidStaffStatusTransition('OPEN', 'WAITING_FOR_REQUESTER')).toBe(true);
    expect(isValidStaffStatusTransition('OPEN', 'CANCELLED')).toBe(true);
    expect(isValidStaffStatusTransition('IN_PROGRESS', 'WAITING_FOR_REQUESTER')).toBe(true);
    expect(isValidStaffStatusTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(isValidStaffStatusTransition('IN_PROGRESS', 'CANCELLED')).toBe(true);
    expect(isValidStaffStatusTransition('WAITING_FOR_REQUESTER', 'IN_PROGRESS')).toBe(true);
    expect(isValidStaffStatusTransition('WAITING_FOR_REQUESTER', 'RESOLVED')).toBe(true);
    expect(isValidStaffStatusTransition('WAITING_FOR_REQUESTER', 'CANCELLED')).toBe(true);
    expect(isValidStaffStatusTransition('RESOLVED', 'CLOSED')).toBe(true);
    expect(isValidStaffStatusTransition('RESOLVED', 'REOPENED')).toBe(true);
    expect(isValidStaffStatusTransition('REOPENED', 'IN_PROGRESS')).toBe(true);
    expect(isValidStaffStatusTransition('REOPENED', 'RESOLVED')).toBe(true);
    expect(isValidStaffStatusTransition('REOPENED', 'CANCELLED')).toBe(true);
  });

  it('rejects an invalid jump such as NEW to RESOLVED or NEW to CLOSED', () => {
    expect(isValidStaffStatusTransition('NEW', 'RESOLVED')).toBe(false);
    expect(isValidStaffStatusTransition('NEW', 'CLOSED')).toBe(false);
    expect(isValidStaffStatusTransition('NEW', 'REOPENED')).toBe(false);
  });

  it('treats CLOSED and CANCELLED as terminal — no permitted next statuses', () => {
    expect(getPermittedNextStatuses('CLOSED')).toEqual([]);
    expect(getPermittedNextStatuses('CANCELLED')).toEqual([]);
    expect(isValidStaffStatusTransition('CLOSED', 'OPEN')).toBe(false);
    expect(isValidStaffStatusTransition('CANCELLED', 'NEW')).toBe(false);
  });

  it('reports the exact permitted next statuses for a given current status', () => {
    expect(getPermittedNextStatuses('IN_PROGRESS')).toEqual(['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED']);
  });

  it('requires a resolutionSummary of at least 5 characters when moving to RESOLVED or CLOSED', () => {
    expect(validateStatusChangeFields('IN_PROGRESS', 'RESOLVED', {}).isValid).toBe(false);
    expect(validateStatusChangeFields('IN_PROGRESS', 'RESOLVED', { resolutionSummary: 'ok' }).isValid).toBe(false);
    expect(
      validateStatusChangeFields('IN_PROGRESS', 'RESOLVED', { resolutionSummary: 'Replaced the battery.' }).isValid,
    ).toBe(true);
    expect(validateStatusChangeFields('RESOLVED', 'CLOSED', {}).isValid).toBe(false);
    expect(validateStatusChangeFields('RESOLVED', 'CLOSED', { resolutionSummary: 'Confirmed fixed.' }).isValid).toBe(
      true,
    );
  });

  it('requires a reopenReason of at least 5 characters only when moving from RESOLVED to REOPENED', () => {
    expect(validateStatusChangeFields('RESOLVED', 'REOPENED', {}).isValid).toBe(false);
    expect(validateStatusChangeFields('RESOLVED', 'REOPENED', { reopenReason: 'no' }).isValid).toBe(false);
    expect(
      validateStatusChangeFields('RESOLVED', 'REOPENED', { reopenReason: 'Issue recurred overnight.' }).isValid,
    ).toBe(true);
  });

  it('does not require resolutionSummary or reopenReason for a plain transition like OPEN to IN_PROGRESS', () => {
    expect(validateStatusChangeFields('OPEN', 'IN_PROGRESS', {}).isValid).toBe(true);
  });
});
