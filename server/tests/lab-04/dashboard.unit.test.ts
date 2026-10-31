/**
 * server/tests/lab-04/dashboard.unit.test.ts
 *
 * Tests: UNIT-L4-05 (Requester part) and UNIT-L4-06 (My Tickets part), docs/lab-04/tests.md §2.1.
 * The dashboard drill-down builder, the active-status set, the rolling recent window, the concise
 * list item, and the `statusGroup` / `sortBy=updatedAt` additions to the My Tickets normalizer.
 */

import { describe, it, expect } from 'vitest';
import {
  ACTIVE_TICKET_STATUSES,
  DASHBOARD_LIST_LIMIT,
  RECENT_WINDOW_DAYS,
  REQUESTER_LIST_VIEW_ALL,
  buildRequesterCards,
  recentWindowStart,
  toDashboardTicketItem,
} from '../../src/utils/dashboard.js';
import { normalizeTicketListQuery } from '../../src/utils/ticketQuery.js';

describe('UNIT-L4-05: dashboard drill-down builder and active-status set', () => {
  it('the active set is exactly the five open statuses (BR-21)', () => {
    expect([...ACTIVE_TICKET_STATUSES].sort()).toEqual(
      ['IN_PROGRESS', 'NEW', 'OPEN', 'REOPENED', 'WAITING_FOR_REQUESTER'].sort(),
    );
  });

  it('lists hold at most 5 items and the recent window is 7 days', () => {
    expect(DASHBOARD_LIST_LIMIT).toBe(5);
    expect(RECENT_WINDOW_DAYS).toBe(7);
  });

  it('the recent window is a rolling 7 x 24 h, not a calendar boundary', () => {
    const now = new Date('2026-11-03T05:10:00.000Z');
    expect(recentWindowStart(now).toISOString()).toBe('2026-10-27T05:10:00.000Z');
  });

  it('builds the four Requester cards in order with the exact BR-22 drill-downs', () => {
    const cards = buildRequesterCards({ openTickets: 3, waitingForMe: 1, resolved: 2, closed: 12 });
    expect(cards).toEqual([
      { key: 'openTickets', label: 'My Open Tickets', value: 3, drillDown: { path: '/tickets', query: { statusGroup: 'active' } } },
      { key: 'waitingForMe', label: 'Waiting for Me', value: 1, drillDown: { path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } } },
      { key: 'resolved', label: 'Resolved', value: 2, drillDown: { path: '/tickets', query: { currentStatus: 'RESOLVED' } } },
      { key: 'closed', label: 'Closed', value: 12, drillDown: { path: '/tickets', query: { currentStatus: 'CLOSED' } } },
    ]);
  });

  it('keeps zero values as 0 (BR-25)', () => {
    const cards = buildRequesterCards({ openTickets: 0, waitingForMe: 0, resolved: 0, closed: 0 });
    expect(cards.map((c) => c.value)).toEqual([0, 0, 0, 0]);
  });

  it('builds the "View all" targets for the three Requester lists (api-spec §3)', () => {
    expect(REQUESTER_LIST_VIEW_ALL).toEqual({
      attentionRequired: { path: '/tickets', query: { currentStatus: 'WAITING_FOR_REQUESTER' } },
      recentlyUpdated: { path: '/tickets', query: { sortBy: 'updatedAt', sortOrder: 'desc' } },
      recentlyResolved: { path: '/tickets', query: { currentStatus: 'RESOLVED' } },
    });
  });

  it('turns a Ticket into a concise DashboardTicketItem with only the documented keys', () => {
    const updatedAt = new Date('2026-11-03T04:00:00.000Z');
    const item = toDashboardTicketItem({
      id: 10,
      ticketNumber: 'TKT-2026-000010',
      summary: 'Laptop battery drains quickly',
      description: 'must not leak',
      currentStatus: 'IN_PROGRESS',
      itPriority: 'HIGH',
      ticketOwner: { id: 5, name: 'Michael Brown' },
      updatedAt,
      resolvedAt: null,
    });
    expect(item).toEqual({
      id: 10,
      ticketNumber: 'TKT-2026-000010',
      summary: 'Laptop battery drains quickly',
      currentStatus: 'IN_PROGRESS',
      itPriority: 'HIGH',
      owner: { id: 5, name: 'Michael Brown' },
      updatedAt,
      resolvedAt: null,
    });
  });

  it('a Ticket without an owner or IT priority gives null, not undefined', () => {
    const item = toDashboardTicketItem({
      id: 1,
      ticketNumber: 'TKT-2026-000001',
      summary: 's',
      currentStatus: 'NEW',
      itPriority: null,
      ticketOwner: null,
      updatedAt: new Date(),
      resolvedAt: null,
    });
    expect(item.owner).toBeNull();
    expect(item.itPriority).toBeNull();
  });
});

describe('UNIT-L4-06: My Tickets query normalizer additions (FR-16)', () => {
  it('applies statusGroup=active', () => {
    expect(normalizeTicketListQuery({ statusGroup: 'active' }).statusGroup).toBe('active');
  });

  it('drops an invalid statusGroup', () => {
    expect(normalizeTicketListQuery({ statusGroup: 'closed' }).statusGroup).toBeUndefined();
    expect(normalizeTicketListQuery({ statusGroup: ['active'] }).statusGroup).toBeUndefined();
  });

  it('currentStatus wins over statusGroup', () => {
    const q = normalizeTicketListQuery({ statusGroup: 'active', currentStatus: 'RESOLVED' });
    expect(q.currentStatus).toBe('RESOLVED');
    expect(q.statusGroup).toBeUndefined();
  });

  it('an invalid currentStatus does not cancel a valid statusGroup', () => {
    const q = normalizeTicketListQuery({ statusGroup: 'active', currentStatus: 'BOGUS' });
    expect(q.currentStatus).toBeUndefined();
    expect(q.statusGroup).toBe('active');
  });

  it('accepts sortBy=updatedAt and still defaults unknown fields to createdAt', () => {
    expect(normalizeTicketListQuery({ sortBy: 'updatedAt' }).sortBy).toBe('updatedAt');
    expect(normalizeTicketListQuery({ sortBy: 'resolvedAt' }).sortBy).toBe('createdAt');
  });
});
