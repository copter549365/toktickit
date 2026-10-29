/**
 * server/tests/lab-04/workflow.unit.test.ts
 *
 * Tests: UNIT-L4-03 (BR-13 final matrix, permittedNextStatuses by role) and UNIT-L4-04
 * (BR-14 evaluateResolutionGate) — docs/lab-04/tests.md §2.1.
 */

import { describe, it, expect } from 'vitest';
import {
  STAFF_STATUS_TRANSITIONS,
  permittedNextStatuses,
  evaluateResolutionGate,
  validateStatusChangeFields,
} from '../../src/utils/statusTransition.js';

const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'];

// docs/lab-04/specification.md BR-13, the 18 staff rows.
const PERMITTED = new Set([
  'NEW>OPEN', 'NEW>IN_PROGRESS', 'NEW>CANCELLED',
  'OPEN>IN_PROGRESS', 'OPEN>WAITING_FOR_REQUESTER', 'OPEN>CANCELLED',
  'IN_PROGRESS>WAITING_FOR_REQUESTER', 'IN_PROGRESS>RESOLVED', 'IN_PROGRESS>CANCELLED',
  'WAITING_FOR_REQUESTER>IN_PROGRESS', 'WAITING_FOR_REQUESTER>RESOLVED', 'WAITING_FOR_REQUESTER>CANCELLED',
  'RESOLVED>CLOSED', 'RESOLVED>REOPENED',
  'REOPENED>IN_PROGRESS', 'REOPENED>WAITING_FOR_REQUESTER', 'REOPENED>RESOLVED', 'REOPENED>CANCELLED',
]);

describe('UNIT-L4-03: final transition matrix (BR-13)', () => {
  it('has exactly the 18 permitted staff rows and nothing else', () => {
    expect(PERMITTED.size).toBe(18);
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const allowed = (STAFF_STATUS_TRANSITIONS[from] ?? []).includes(to);
        expect(allowed, `${from} → ${to}`).toBe(PERMITTED.has(`${from}>${to}`));
      }
    }
  });

  it('allows REOPENED → WAITING_FOR_REQUESTER (new in Lab 4, D-07)', () => {
    expect(STAFF_STATUS_TRANSITIONS.REOPENED).toContain('WAITING_FOR_REQUESTER');
  });

  it('gives IT Staff and Administrators the staff row for every status', () => {
    for (const role of ['IT_STAFF', 'ADMINISTRATOR'] as const) {
      for (const status of STATUSES) {
        expect(permittedNextStatuses(status, role, false)).toEqual(STAFF_STATUS_TRANSITIONS[status]);
      }
    }
  });

  it('gives the owning Requester only NEW → CANCELLED, and other Requesters nothing', () => {
    for (const status of STATUSES) {
      expect(permittedNextStatuses(status, 'REQUESTER', true)).toEqual(status === 'NEW' ? ['CANCELLED'] : []);
      expect(permittedNextStatuses(status, 'REQUESTER', false)).toEqual([]);
    }
  });
});

describe('UNIT-L4-04: evaluateResolutionGate (BR-14)', () => {
  const owner = { isActive: true, role: 'IT_STAFF' };
  const done = { status: 'COMPLETED', followUpRequired: false };

  it('is met with an active owner, a completed action, and no open actions', () => {
    const gate = evaluateResolutionGate(owner, [done, { status: 'CANCELLED', followUpRequired: false }]);
    expect(gate.met).toBe(true);
    expect(gate.conditions.map((c) => [c.key, c.met])).toEqual([
      ['HAS_OWNER', true],
      ['HAS_COMPLETED_ACTION', true],
      ['NO_OPEN_ACTIONS', true],
    ]);
    expect(gate.warnings).toEqual([]);
  });

  it('reports a missing or inactive owner', () => {
    expect(evaluateResolutionGate(null, [done]).conditions[0]).toMatchObject({ key: 'HAS_OWNER', met: false });
    expect(evaluateResolutionGate({ isActive: false, role: 'IT_STAFF' }, [done]).met).toBe(false);
    expect(evaluateResolutionGate({ isActive: true, role: 'REQUESTER' }, [done]).met).toBe(false);
    expect(evaluateResolutionGate({ isActive: true, role: 'ADMINISTRATOR' }, [done]).met).toBe(true);
  });

  it('reports no completed action and each open action', () => {
    const none = evaluateResolutionGate(owner, []);
    expect(none.met).toBe(false);
    expect(none.conditions.filter((c) => !c.met).map((c) => c.key)).toEqual(['HAS_COMPLETED_ACTION']);

    for (const open of ['PLANNED', 'IN_PROGRESS']) {
      const gate = evaluateResolutionGate(owner, [done, { status: open, followUpRequired: false }]);
      expect(gate.met).toBe(false);
      expect(gate.conditions.filter((c) => !c.met).map((c) => c.key)).toEqual(['NO_OPEN_ACTIONS']);
    }
  });

  it('lists every unmet condition at once', () => {
    const gate = evaluateResolutionGate(null, [{ status: 'PLANNED', followUpRequired: false }]);
    expect(gate.conditions.filter((c) => !c.met).map((c) => c.key)).toEqual([
      'HAS_OWNER',
      'HAS_COMPLETED_ACTION',
      'NO_OPEN_ACTIONS',
    ]);
  });

  it('warns about completed actions that need follow-up without blocking (D-06)', () => {
    const one = evaluateResolutionGate(owner, [{ status: 'COMPLETED', followUpRequired: true }]);
    expect(one.met).toBe(true);
    expect(one.warnings).toEqual(['1 completed action requires follow-up']);
    const two = evaluateResolutionGate(owner, [
      { status: 'COMPLETED', followUpRequired: true },
      { status: 'COMPLETED', followUpRequired: true },
      { status: 'CANCELLED', followUpRequired: true },
    ]);
    expect(two.warnings).toEqual(['2 completed actions require follow-up']);
  });
});

describe('validateStatusChangeFields (Lab 4 api-spec §2.2)', () => {
  it('makes resolutionSummary optional for CLOSED but still checks it when sent', () => {
    expect(validateStatusChangeFields('RESOLVED', 'CLOSED', {}).isValid).toBe(true);
    expect(validateStatusChangeFields('RESOLVED', 'CLOSED', { resolutionSummary: 'ok' }).isValid).toBe(false);
    const v = validateStatusChangeFields('RESOLVED', 'CLOSED', { resolutionSummary: ' Confirmed fixed. ' });
    expect(v.trimmedResolutionSummary).toBe('Confirmed fixed.');
  });

  it('accepts an optional note of at most 500 characters', () => {
    expect(validateStatusChangeFields('OPEN', 'CANCELLED', { note: ' Duplicate ticket. ' }).trimmedNote).toBe('Duplicate ticket.');
    expect(validateStatusChangeFields('OPEN', 'CANCELLED', { note: 'x'.repeat(501) }).fieldErrors).toHaveProperty('note');
    expect(validateStatusChangeFields('OPEN', 'CANCELLED', { note: 42 }).fieldErrors).toHaveProperty('note');
  });
});
