/**
 * server/tests/lab-03/queue-query.unit.test.ts
 *
 * Test: UNIT-03 (FR-15, AC-05) — IT Staff Ticket Queue query normalizer (api-spec.md §3).
 * Every unknown or invalid value must degrade to its documented default rather than erroring.
 */

import { describe, it, expect } from 'vitest';
import { normalizeStaffQueueQuery } from '../../src/utils/ticketQuery.js';

describe('UNIT-03: Staff Ticket Queue query normalizer (FR-15, AC-05)', () => {
  it('defaults sortBy to createdAt and sortOrder to desc when omitted', () => {
    const result = normalizeStaffQueueQuery({});
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortOrder).toBe('desc');
  });

  it('accepts every documented sortBy field', () => {
    for (const field of ['createdAt', 'ticketNumber', 'requestedPriority', 'itPriority', 'currentStatus', 'updatedAt']) {
      expect(normalizeStaffQueueQuery({ sortBy: field }).sortBy).toBe(field);
    }
  });

  it('falls back safely on an invalid sortBy or sortOrder rather than throwing', () => {
    const result = normalizeStaffQueueQuery({ sortBy: 'summary', sortOrder: 'sideways' });
    // 'summary' is sortable on the Requester list but NOT documented for the staff queue.
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortOrder).toBe('desc');
  });

  it('falls back to page 1 for negative, zero, or non-integer page values', () => {
    expect(normalizeStaffQueueQuery({ page: '-3' }).page).toBe(1);
    expect(normalizeStaffQueueQuery({ page: '0' }).page).toBe(1);
    expect(normalizeStaffQueueQuery({ page: 'abc' }).page).toBe(1);
    expect(normalizeStaffQueueQuery({ page: '4' }).page).toBe(4);
  });

  it('falls back to page size 10 for an oversized or invalid pageSize, and accepts 20/50', () => {
    expect(normalizeStaffQueueQuery({}).pageSize).toBe(10);
    expect(normalizeStaffQueueQuery({ pageSize: '20' }).pageSize).toBe(20);
    expect(normalizeStaffQueueQuery({ pageSize: '50' }).pageSize).toBe(50);
    expect(normalizeStaffQueueQuery({ pageSize: '999' }).pageSize).toBe(10);
    expect(normalizeStaffQueueQuery({ pageSize: '-5' }).pageSize).toBe(10);
  });

  it('trims search and omits it when blank', () => {
    expect(normalizeStaffQueueQuery({ search: '  vpn issue  ' }).search).toBe('vpn issue');
    expect(normalizeStaffQueueQuery({ search: '   ' }).search).toBeUndefined();
  });

  it('only applies categoryId, requestedPriority, itPriority, currentStatus when they are valid', () => {
    expect(normalizeStaffQueueQuery({ categoryId: '3' }).categoryId).toBe(3);
    expect(normalizeStaffQueueQuery({ categoryId: '-1' }).categoryId).toBeUndefined();
    expect(normalizeStaffQueueQuery({ requestedPriority: 'HIGH' }).requestedPriority).toBe('HIGH');
    expect(normalizeStaffQueueQuery({ requestedPriority: 'URGENT' }).requestedPriority).toBeUndefined();
    expect(normalizeStaffQueueQuery({ itPriority: 'LOW' }).itPriority).toBe('LOW');
    expect(normalizeStaffQueueQuery({ itPriority: 'BOGUS' }).itPriority).toBeUndefined();
    expect(normalizeStaffQueueQuery({ currentStatus: 'WAITING_FOR_REQUESTER' }).currentStatus).toBe(
      'WAITING_FOR_REQUESTER',
    );
    expect(normalizeStaffQueueQuery({ currentStatus: 'BOGUS' }).currentStatus).toBeUndefined();
  });

  it('accepts ticketOwnerId as "unassigned" or a positive integer, and rejects anything else', () => {
    expect(normalizeStaffQueueQuery({ ticketOwnerId: 'unassigned' }).ticketOwnerId).toBe('unassigned');
    expect(normalizeStaffQueueQuery({ ticketOwnerId: '5' }).ticketOwnerId).toBe(5);
    expect(normalizeStaffQueueQuery({ ticketOwnerId: '-1' }).ticketOwnerId).toBeUndefined();
    expect(normalizeStaffQueueQuery({ ticketOwnerId: 'abc' }).ticketOwnerId).toBeUndefined();
    expect(normalizeStaffQueueQuery({}).ticketOwnerId).toBeUndefined();
  });
});
