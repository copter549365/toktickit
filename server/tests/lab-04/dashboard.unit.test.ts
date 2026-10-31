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
  STAFF_LIST_VIEW_ALL,
  buildPriorityCards,
  buildRequesterCards,
  buildStatusCards,
  buildUserAccountCards,
  buildWorkloadCards,
  recentWindowStart,
  toDashboardActionItem,
  toDashboardTicketItem,
} from '../../src/utils/dashboard.js';
import { normalizeStaffQueueQuery, normalizeTicketListQuery } from '../../src/utils/ticketQuery.js';

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
    const createdAt = new Date('2026-11-01T02:00:00.000Z'); // D-18: for the Urgent list's age
    const item = toDashboardTicketItem(<Parameters<typeof toDashboardTicketItem>[0]>{
      id: 10,
      ticketNumber: 'TKT-2026-000010',
      summary: 'Laptop battery drains quickly',
      description: 'must not leak',
      currentStatus: 'IN_PROGRESS',
      itPriority: 'HIGH',
      ticketOwner: { id: 5, name: 'Michael Brown' },
      createdAt,
      updatedAt,
      resolvedAt: null,
      requesterResolvedIndicator: true,
    });
    expect(item).toEqual({
      id: 10,
      ticketNumber: 'TKT-2026-000010',
      summary: 'Laptop battery drains quickly',
      currentStatus: 'IN_PROGRESS',
      itPriority: 'HIGH',
      owner: { id: 5, name: 'Michael Brown' },
      createdAt,
      updatedAt,
      resolvedAt: null,
      requesterResolvedIndicator: true,
    });
  });

  it('a Ticket without an owner or IT priority gives null, not undefined', () => {
    const item = toDashboardTicketItem(<Parameters<typeof toDashboardTicketItem>[0]>{
      id: 1,
      ticketNumber: 'TKT-2026-000001',
      summary: 's',
      currentStatus: 'NEW',
      itPriority: null,
      ticketOwner: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      requesterResolvedIndicator: false,
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

describe('UNIT-L4-05: Staff and Administrator cards (BR-23, BR-24, D-18)', () => {
  const counts = { NEW: 4, OPEN: 3, IN_PROGRESS: 5, WAITING_FOR_REQUESTER: 2, REOPENED: 1, RESOLVED: 2 };

  it('builds the six status cards in workflow order, each drilling to the Queue by status', () => {
    const cards = buildStatusCards(counts);
    expect(cards.map((c) => [c.key, c.label, c.value])).toEqual([
      ['NEW', 'New', 4],
      ['OPEN', 'Open', 3],
      ['IN_PROGRESS', 'In Progress', 5],
      ['WAITING_FOR_REQUESTER', 'Waiting for Requester', 2],
      ['REOPENED', 'Reopened', 1],
      ['RESOLVED', 'Resolved', 2],
    ]);
    for (const c of cards) expect(c.drillDown).toEqual({ path: '/staff/tickets', query: { currentStatus: c.key } });
  });

  it('builds the workload cards with "me" as the owner id and no drill-down for My Open Actions', () => {
    const cards = buildWorkloadCards(5, { unassignedActive: 3, myActive: 4, requesterMarkedResolved: 1, myOpenActions: 2 });
    expect(cards).toEqual([
      { key: 'unassignedActive', label: 'Unassigned', value: 3, drillDown: { path: '/staff/tickets', query: { ticketOwnerId: 'unassigned', statusGroup: 'active' } } },
      { key: 'myActive', label: 'My Assigned', value: 4, drillDown: { path: '/staff/tickets', query: { ticketOwnerId: '5', statusGroup: 'active' } } },
      { key: 'requesterMarkedResolved', label: 'Marked Resolved by Requester', value: 1, drillDown: { path: '/staff/tickets', query: { statusGroup: 'active', requesterResolvedIndicator: 'true' } } },
      { key: 'myOpenActions', label: 'My Open Actions', value: 2, drillDown: null },
    ]);
  });

  it('builds the IT Priority cards over active Tickets', () => {
    const cards = buildPriorityCards({ LOW: 4, MEDIUM: 6, HIGH: 5 });
    expect(cards.map((c) => [c.key, c.label, c.value])).toEqual([
      ['LOW', 'Low', 4],
      ['MEDIUM', 'Medium', 6],
      ['HIGH', 'High', 5],
    ]);
    for (const c of cards) expect(c.drillDown).toEqual({ path: '/staff/tickets', query: { itPriority: c.key, statusGroup: 'active' } });
  });

  it('builds the Administrator user-account cards with drill-downs that match their counts (D-18)', () => {
    const cards = buildUserAccountCards({ activeRequesters: 5, activeItStaff: 4, activeAdministrators: 1, inactiveUsers: 2 });
    expect(cards).toEqual([
      { key: 'activeRequesters', label: 'Active Requesters', value: 5, drillDown: { path: '/admin/users', query: { role: 'REQUESTER', isActive: 'true' } } },
      { key: 'activeItStaff', label: 'Active IT Staff', value: 4, drillDown: { path: '/admin/users', query: { role: 'IT_STAFF', isActive: 'true' } } },
      { key: 'activeAdministrators', label: 'Active Administrators', value: 1, drillDown: { path: '/admin/users', query: { role: 'ADMINISTRATOR', isActive: 'true' } } },
      { key: 'inactiveUsers', label: 'Inactive Accounts', value: 2, drillDown: { path: '/admin/users', query: { isActive: 'false' } } },
    ]);
  });

  it('builds the "View all" targets for the staff lists', () => {
    expect(STAFF_LIST_VIEW_ALL).toEqual({
      urgent: { path: '/staff/tickets', query: { itPriority: 'HIGH', statusGroup: 'active', sortBy: 'createdAt', sortOrder: 'asc' } },
      recentlyUpdated: { path: '/staff/tickets', query: { sortBy: 'updatedAt', sortOrder: 'desc' } },
    });
  });

  it('turns an Action Taken into a concise My Open Actions item', () => {
    const actionAt = new Date('2026-11-02T02:00:00.000Z');
    expect(
      toDashboardActionItem(<Parameters<typeof toDashboardActionItem>[0]>{
        id: 44,
        ticketId: 12,
        description: 'Collect VPN client logs',
        status: 'PLANNED',
        actionAt,
        followUpRequired: false,
        result: 'must not leak',
        ticket: { ticketNumber: 'TKT-2026-000012', summary: 'VPN disconnects' },
      }),
    ).toEqual({
      actionId: 44,
      ticketId: 12,
      ticketNumber: 'TKT-2026-000012',
      ticketSummary: 'VPN disconnects',
      description: 'Collect VPN client logs',
      status: 'PLANNED',
      actionAt,
      followUpRequired: false,
    });
  });
});

describe('UNIT-L4-06: Queue query normalizer additions (FR-16)', () => {
  it('applies statusGroup=active, and currentStatus wins over it', () => {
    expect(normalizeStaffQueueQuery({ statusGroup: 'active' }).statusGroup).toBe('active');
    const q = normalizeStaffQueueQuery({ statusGroup: 'active', currentStatus: 'NEW' });
    expect(q.currentStatus).toBe('NEW');
    expect(q.statusGroup).toBeUndefined();
  });

  it('applies requesterResolvedIndicator=true only', () => {
    expect(normalizeStaffQueueQuery({ requesterResolvedIndicator: 'true' }).requesterResolvedIndicator).toBe(true);
    expect(normalizeStaffQueueQuery({ requesterResolvedIndicator: 'false' }).requesterResolvedIndicator).toBeUndefined();
    expect(normalizeStaffQueueQuery({ requesterResolvedIndicator: 'yes' }).requesterResolvedIndicator).toBeUndefined();
  });

  it('drops an invalid statusGroup', () => {
    expect(normalizeStaffQueueQuery({ statusGroup: 'done' }).statusGroup).toBeUndefined();
  });
});
