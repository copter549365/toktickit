/**
 * server/tests/lab-04/actions-taken.unit.test.ts
 *
 * Tests: UNIT-L4-01 (BR-07 action lifecycle), UNIT-L4-02 (BR-03/BR-04 field validation)
 * (docs/lab-04/tests.md §2).
 */

import { describe, it, expect } from 'vitest';
import {
  ACTION_STATUSES,
  canTransitionAction,
  isOpenActionStatus,
  validateActionFields,
  isUuidV4,
} from '../../src/utils/actionsTaken.js';

const NOW = new Date('2026-11-03T10:00:00.000Z');
const TICKET_CREATED = new Date('2026-11-01T00:00:00.000Z');
const ctx = { ticketCreatedAt: TICKET_CREATED, now: NOW };

const valid = {
  actionAt: '2026-11-02T09:00:00.000Z',
  description: 'Replaced the laptop battery.',
  result: null,
  status: 'PLANNED',
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  cancelReason: null,
};

describe('UNIT-L4-01: canTransitionAction (BR-07)', () => {
  it('allows create only as PLANNED, IN_PROGRESS or COMPLETED', () => {
    expect(canTransitionAction(null, 'PLANNED')).toBe(true);
    expect(canTransitionAction(null, 'IN_PROGRESS')).toBe(true);
    expect(canTransitionAction(null, 'COMPLETED')).toBe(true);
    expect(canTransitionAction(null, 'CANCELLED')).toBe(false);
  });

  it('allows exactly the BR-07 pairs between existing statuses', () => {
    const allowed = new Set([
      'PLANNED>IN_PROGRESS',
      'PLANNED>COMPLETED',
      'PLANNED>CANCELLED',
      'IN_PROGRESS>COMPLETED',
      'IN_PROGRESS>CANCELLED',
    ]);
    for (const from of ACTION_STATUSES) {
      for (const to of ACTION_STATUSES) {
        expect(canTransitionAction(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it('treats COMPLETED and CANCELLED as terminal and PLANNED / IN_PROGRESS as open', () => {
    expect(ACTION_STATUSES.filter(isOpenActionStatus)).toEqual(['PLANNED', 'IN_PROGRESS']);
  });

  it('rejects unknown status values', () => {
    expect(canTransitionAction(null, 'DONE')).toBe(false);
    expect(canTransitionAction('PLANNED', 'DONE')).toBe(false);
  });
});

describe('UNIT-L4-02: validateActionFields (BR-03, BR-04)', () => {
  it('accepts valid input and trims text', () => {
    const r = validateActionFields({ ...valid, description: '   Replaced the laptop battery.  ' }, ctx);
    expect(r.fieldErrors).toEqual({});
    expect(r.values.description).toBe('Replaced the laptop battery.');
    expect(r.values.actionAt).toEqual(new Date(valid.actionAt));
  });

  it('defaults actionAt to now when it is missing', () => {
    const r = validateActionFields({ ...valid, actionAt: undefined }, ctx);
    expect(r.fieldErrors).toEqual({});
    expect(r.values.actionAt).toEqual(NOW);
  });

  it('requires a 5–2000 character description', () => {
    expect(validateActionFields({ ...valid, description: '  abc ' }, ctx).fieldErrors).toHaveProperty('description');
    expect(validateActionFields({ ...valid, description: undefined }, ctx).fieldErrors).toHaveProperty('description');
    expect(validateActionFields({ ...valid, description: 'x'.repeat(2001) }, ctx).fieldErrors).toHaveProperty('description');
    expect(validateActionFields({ ...valid, description: 'x'.repeat(2000) }, ctx).fieldErrors).toEqual({});
  });

  it('requires a result of 5+ characters when COMPLETED, and caps it at 2000 otherwise', () => {
    expect(validateActionFields({ ...valid, status: 'COMPLETED' }, ctx).fieldErrors).toHaveProperty('result');
    expect(validateActionFields({ ...valid, status: 'COMPLETED', result: ' ok ' }, ctx).fieldErrors).toHaveProperty('result');
    expect(validateActionFields({ ...valid, status: 'COMPLETED', result: 'Battery fixed.' }, ctx).fieldErrors).toEqual({});
    expect(validateActionFields({ ...valid, result: 'x'.repeat(2001) }, ctx).fieldErrors).toHaveProperty('result');
    expect(validateActionFields({ ...valid, result: '   ' }, ctx).values.result).toBeNull();
  });

  it('requires a 5–1000 character follow-up note only when follow-up is required, nulling it otherwise', () => {
    expect(validateActionFields({ ...valid, followUpRequired: true }, ctx).fieldErrors).toHaveProperty('followUpNote');
    expect(
      validateActionFields({ ...valid, followUpRequired: true, followUpNote: 'x'.repeat(1001) }, ctx).fieldErrors,
    ).toHaveProperty('followUpNote');
    const ok = validateActionFields({ ...valid, followUpRequired: true, followUpNote: ' Check again in two weeks. ' }, ctx);
    expect(ok.fieldErrors).toEqual({});
    expect(ok.values.followUpNote).toBe('Check again in two weeks.');

    const dropped = validateActionFields({ ...valid, followUpRequired: false, followUpNote: 'Stale note text' }, ctx);
    expect(dropped.fieldErrors).toEqual({});
    expect(dropped.values.followUpNote).toBeNull();
  });

  it('rejects a non-boolean followUpRequired', () => {
    expect(validateActionFields({ ...valid, followUpRequired: 'yes' }, ctx).fieldErrors).toHaveProperty('followUpRequired');
  });

  it('caps attachmentNotes at 1000 characters', () => {
    expect(validateActionFields({ ...valid, attachmentNotes: 'x'.repeat(1001) }, ctx).fieldErrors).toHaveProperty('attachmentNotes');
  });

  it('rejects an actionAt more than 5 minutes in the future, before the ticket was created, or unparseable', () => {
    const future = new Date(NOW.getTime() + 6 * 60_000).toISOString();
    const almost = new Date(NOW.getTime() + 4 * 60_000).toISOString();
    expect(validateActionFields({ ...valid, actionAt: future }, ctx).fieldErrors).toHaveProperty('actionAt');
    expect(validateActionFields({ ...valid, actionAt: almost }, ctx).fieldErrors).toEqual({});
    expect(validateActionFields({ ...valid, actionAt: '2026-10-31T23:59:59.000Z' }, ctx).fieldErrors).toHaveProperty('actionAt');
    expect(validateActionFields({ ...valid, actionAt: 'yesterday' }, ctx).fieldErrors).toHaveProperty('actionAt');
  });

  it('requires a 5–500 character cancelReason only when CANCELLED', () => {
    expect(validateActionFields({ ...valid, status: 'CANCELLED' }, ctx).fieldErrors).toHaveProperty('cancelReason');
    expect(
      validateActionFields({ ...valid, status: 'CANCELLED', cancelReason: 'x'.repeat(501) }, ctx).fieldErrors,
    ).toHaveProperty('cancelReason');
    const ok = validateActionFields({ ...valid, status: 'CANCELLED', cancelReason: 'Duplicate of another action.' }, ctx);
    expect(ok.fieldErrors).toEqual({});
    expect(ok.values.cancelReason).toBe('Duplicate of another action.');
    expect(validateActionFields({ ...valid, cancelReason: 'Not cancelling' }, ctx).values.cancelReason).toBeNull();
  });

  it('reports every violation at once', () => {
    const r = validateActionFields(
      { ...valid, description: 'no', status: 'COMPLETED', followUpRequired: true, actionAt: '2030-01-01T00:00:00Z' },
      ctx,
    );
    expect(Object.keys(r.fieldErrors).sort()).toEqual(['actionAt', 'description', 'followUpNote', 'result']);
  });
});

describe('isUuidV4 (BR-20)', () => {
  it('accepts v4 UUIDs and rejects anything else', () => {
    expect(isUuidV4('6f1c2b0e-8a4d-4b7e-9d1a-2f5e3c7b9a10')).toBe(true);
    expect(isUuidV4('6F1C2B0E-8A4D-4B7E-9D1A-2F5E3C7B9A10')).toBe(true);
    expect(isUuidV4('6f1c2b0e-8a4d-1b7e-9d1a-2f5e3c7b9a10')).toBe(false); // v1
    expect(isUuidV4('not-a-uuid')).toBe(false);
    expect(isUuidV4(42)).toBe(false);
  });
});
