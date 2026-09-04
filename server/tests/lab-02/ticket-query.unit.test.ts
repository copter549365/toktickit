import { describe, it, expect } from 'vitest';
import { normalizeTicketListQuery } from '../../src/utils/ticketQuery.js';

describe('UNIT-03: Ticket List Query Normalizer (BR-27, BR-28, BR-29)', () => {
  it('defaults sortBy to createdAt and sortOrder to desc when omitted (BR-27)', () => {
    const result = normalizeTicketListQuery({});
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortOrder).toBe('desc');
  });

  it('accepts documented sortBy values and sortOrder values', () => {
    expect(normalizeTicketListQuery({ sortBy: 'ticketNumber', sortOrder: 'asc' })).toMatchObject({
      sortBy: 'ticketNumber',
      sortOrder: 'asc',
    });
    expect(normalizeTicketListQuery({ sortBy: 'summary' }).sortBy).toBe('summary');
  });

  it('falls back to defaults for unknown/invalid sortBy or sortOrder rather than throwing', () => {
    const result = normalizeTicketListQuery({ sortBy: 'notAField', sortOrder: 'sideways' });
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortOrder).toBe('desc');
  });

  it('defaults page size to 10 and accepts 20/50 (BR-28)', () => {
    expect(normalizeTicketListQuery({}).pageSize).toBe(10);
    expect(normalizeTicketListQuery({ pageSize: '20' }).pageSize).toBe(20);
    expect(normalizeTicketListQuery({ pageSize: '50' }).pageSize).toBe(50);
  });

  it('falls back to page size 10 for any value outside 10/20/50 (BR-28)', () => {
    expect(normalizeTicketListQuery({ pageSize: '999' }).pageSize).toBe(10);
    expect(normalizeTicketListQuery({ pageSize: '0' }).pageSize).toBe(10);
    expect(normalizeTicketListQuery({ pageSize: 'not-a-number' }).pageSize).toBe(10);
  });

  it('defaults page to 1 and accepts any positive integer (BR-29)', () => {
    expect(normalizeTicketListQuery({}).page).toBe(1);
    expect(normalizeTicketListQuery({ page: '7' }).page).toBe(7);
  });

  it('falls back to page 1 for non-integer, zero, or negative page values rather than erroring', () => {
    expect(normalizeTicketListQuery({ page: '0' }).page).toBe(1);
    expect(normalizeTicketListQuery({ page: '-3' }).page).toBe(1);
    expect(normalizeTicketListQuery({ page: 'abc' }).page).toBe(1);
    expect(normalizeTicketListQuery({ page: '2.5' }).page).toBe(1);
  });

  it('trims search and omits it when blank', () => {
    expect(normalizeTicketListQuery({ search: '  laptop battery  ' }).search).toBe('laptop battery');
    expect(normalizeTicketListQuery({ search: '   ' }).search).toBeUndefined();
    expect(normalizeTicketListQuery({}).search).toBeUndefined();
  });

  it('only applies categoryId when it parses as an integer', () => {
    expect(normalizeTicketListQuery({ categoryId: '3' }).categoryId).toBe(3);
    expect(normalizeTicketListQuery({ categoryId: 'abc' }).categoryId).toBeUndefined();
    expect(normalizeTicketListQuery({}).categoryId).toBeUndefined();
  });

  it('only applies requestedPriority/currentStatus when they match a documented enum value', () => {
    expect(normalizeTicketListQuery({ requestedPriority: 'HIGH' }).requestedPriority).toBe('HIGH');
    expect(normalizeTicketListQuery({ requestedPriority: 'URGENT' }).requestedPriority).toBeUndefined();
    expect(normalizeTicketListQuery({ currentStatus: 'NEW' }).currentStatus).toBe('NEW');
    expect(normalizeTicketListQuery({ currentStatus: 'BOGUS' }).currentStatus).toBeUndefined();
  });
});
