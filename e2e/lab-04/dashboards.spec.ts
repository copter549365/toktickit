import type { Page } from '@playwright/test';
import { test, expect, lab4Screenshot } from './fixtures';
import {
  VIEWPORTS,
  apiAsPage,
  assertNoHorizontalScroll,
  expandShellNav,
  loginAs,
  runToken,
  signOut,
  type ViewportName,
} from '../lab-03/helpers';
import { createActionViaApi, prepareTicket } from './helpers';
import { E2E_USERS } from '../lab-03/fixtures';

/**
 * E2E-L4-07, E2E-L4-08, E2E-L4-09 (docs/lab-04/tests.md §2.8).
 * - L4-07: every Requester, IT Staff, and Administrator card opens its list with the filter in the
 *   URL and the controls, and the list total equals the card value. List rows open the Ticket.
 * - L4-08: an injected 500 shows the retryable safe error, and Retry recovers; a Requester is
 *   refused the staff dashboard API and the staff screens.
 * - L4-09: a Requester with no tickets sees every card at 0 and the "Create your first ticket" CTA;
 *   IT Staff with no work see 0 My Assigned and an empty My Open Actions.
 */

const cardGrid = (page: Page) => page.getByRole('list', { name: 'Ticket summary' });

async function cardValue(page: Page, label: string): Promise<number> {
  const name = await cardGrid(page).getByRole('link', { name: new RegExp(`^${label}: \\d+\\. View tickets$`) }).getAttribute('aria-label');
  return Number(name!.match(/: (\d+)\./)![1]);
}

async function openDashboard(page: Page) {
  await expandShellNav(page);
  await page.locator('header').getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(cardGrid(page)).toBeVisible();
}

/** The My Tickets total ("N tickets"), or 0 when the list shows its no-results state. */
async function listTotal(page: Page): Promise<number> {
  const total = page.getByText(/^\d+ tickets?$/);
  const noResults = page.getByText(/No tickets match your filters/i);
  await expect(total.or(noResults)).toBeVisible();
  if (await noResults.isVisible()) return 0;
  return Number((await total.textContent())!.split(' ')[0]);
}

test.describe.serial('Requester Dashboard (E2E-L4-07, E2E-L4-08)', () => {
  const token = runToken('E2E-L4-07');

  test('setup: a Ticket waiting for the Requester, so every list has a row', async ({ page }) => {
    const ticketId = await prepareTicket(page, token);
    for (const status of ['IN_PROGRESS', 'WAITING_FOR_REQUESTER']) {
      const res = await apiAsPage(page, 'PATCH', `/api/staff/tickets/${ticketId}/status`, { status });
      expect(res.ok(), `move to ${status}`).toBe(true);
    }
    await signOut(page);
  });

  test('E2E-L4-07: sign-in opens the Dashboard; each card drills down to an equal, filtered My Tickets', async ({ page }) => {
    await loginAs(page, 'requester');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('header').getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');

    const cases = [
      { label: 'My Open Tickets', query: 'statusGroup=active', control: 'Status group: Active' },
      { label: 'Waiting for Me', query: 'currentStatus=WAITING_FOR_REQUESTER', control: 'Waiting for Requester' },
      { label: 'Resolved', query: 'currentStatus=RESOLVED', control: 'Resolved' },
      { label: 'Closed', query: 'currentStatus=CLOSED', control: 'Closed' },
    ];

    for (const c of cases) {
      await expect(cardGrid(page)).toBeVisible();
      const value = await cardValue(page, c.label);
      if (c.label === 'Waiting for Me') expect(value).toBeGreaterThanOrEqual(1);

      // Keyboard activation for one card, mouse for the rest (AC-22).
      const card = cardGrid(page).getByRole('link', { name: new RegExp(`^${c.label}: `) });
      if (c.label === 'Resolved') {
        await card.focus();
        await page.keyboard.press('Enter');
      } else {
        await card.click();
      }

      await expect(page).toHaveURL(new RegExp(`/tickets\\?${c.query}$`));
      await expect(page.getByRole('status', { name: 'Filtered from Dashboard' })).toBeVisible();
      await expect(page.locator('#tickets-status-filter option:checked')).toHaveText(c.control);
      expect(await listTotal(page), `${c.label} list total`).toBe(value);

      if (c.label === 'Waiting for Me') {
        await page.screenshot({ path: lab4Screenshot('requester-dashboard', 'drilldown-waiting-for-me'), fullPage: true });
      }
      await openDashboard(page);
    }
  });

  test('E2E-L4-07: "View all" and list rows open the matching list and the Ticket', async ({ page }) => {
    await loginAs(page, 'requester');
    const attention = page.getByRole('region', { name: 'Needs My Attention' });
    const row = attention.getByRole('listitem').filter({ hasText: token });
    await expect(row).toContainText('Staff are waiting for your reply');
    await row.getByRole('link').click();
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
    await expect(page.getByText(token).first()).toBeVisible();

    await openDashboard(page);
    await page.getByRole('link', { name: 'View all Recently Updated' }).click();
    await expect(page).toHaveURL(/\/tickets\?sortBy=updatedAt&sortOrder=desc$/);
    await expect(page.getByRole('columnheader', { name: /Last Updated/ })).toHaveAttribute('aria-sort', 'descending');
    // The Ticket just moved to Waiting is the most recently updated one.
    await expect(page.getByTestId('my-tickets-table').locator('tbody tr').first()).toContainText(token);

    // Clear filters returns to the plain list.
    await page.getByRole('status', { name: 'Filtered from Dashboard' }).getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL(/\/tickets$/);
  });

  test('E2E-L4-08: an injected 500 shows the retryable safe error, and Retry recovers', async ({ page }) => {
    await loginAs(page, 'requester');
    await expect(cardGrid(page)).toBeVisible();

    await page.route('**/api/dashboard/requester', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'INTERNAL_ERROR', stack: 'at db.ts:1' }) }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Something went wrong. Please try again.');
    await expect(page.getByText(/db\.ts|INTERNAL_ERROR/)).toHaveCount(0);
    await page.screenshot({ path: lab4Screenshot('requester-dashboard', 'requester-dashboard-error'), fullPage: true });

    await page.unroute('**/api/dashboard/requester');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(cardGrid(page)).toBeVisible();
  });

  for (const [viewportName, viewport] of Object.entries(VIEWPORTS) as [ViewportName, (typeof VIEWPORTS)[ViewportName]][]) {
    test(`layout at ${viewportName}: no horizontal scroll, cards and lists visible`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, 'requester');
      await expect(cardGrid(page).getByRole('link')).toHaveCount(4);
      await expect(page.getByRole('heading', { level: 2, name: 'Needs My Attention' })).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.mouse.move(0, 0); // no hover state in the evidence screenshot
      await page.screenshot({ path: lab4Screenshot('requester-dashboard', `${viewportName}-requester-dashboard`), fullPage: true });
    });
  }
});

test('E2E-L4-09: a Requester with no tickets sees every card at 0 and the first-ticket CTA', async ({ page }) => {
  await loginAs(page, 'requesterEmpty');
  await expect(page).toHaveURL(/\/dashboard$/);
  const labels = await cardGrid(page).getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(labels).toEqual([
    'My Open Tickets: 0. View tickets',
    'Waiting for Me: 0. View tickets',
    'Resolved: 0. View tickets',
    'Closed: 0. View tickets',
  ]);
  await expect(page.getByText("You haven't created any tickets yet")).toBeVisible();
  await page.screenshot({ path: lab4Screenshot('requester-dashboard', 'requester-dashboard-empty'), fullPage: true });

  // A zero card stays clickable and leads to the list's empty state (BR-25).
  await cardGrid(page).getByRole('link', { name: /^Closed: 0/ }).click();
  await expect(page).toHaveURL(/\/tickets\?currentStatus=CLOSED$/);
  await expect(page.getByText(/No tickets match your filters/i)).toBeVisible();

  await openDashboard(page);
  await page.getByRole('link', { name: 'Create your first ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/new$/);
});

// ---------------------------------------------------------------------------
// IT Staff and Administrator Dashboard (Issue 7)
// ---------------------------------------------------------------------------

const STAFF_GRIDS = ['Ticket status', 'Workload', 'IT Priority (active tickets)'];

async function openStaffDashboard(page: Page) {
  await expandShellNav(page);
  await page.locator('header').getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('list', { name: 'Ticket status' })).toBeVisible();
}

/** Every drill-down card as [accessible name, value], read from the dashboard on screen. */
async function staffCards(page: Page, grids: string[]): Promise<Array<[string, number]>> {
  const cards: Array<[string, number]> = [];
  for (const grid of grids) {
    const names = await page
      .getByRole('list', { name: grid })
      .getByRole('link')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    for (const name of names) {
      if (name.endsWith('View the list below')) continue; // My Open Actions: its list is on the page
      cards.push([name, Number(name.match(/: (\d+)\./)![1])]);
    }
  }
  return cards;
}

/** The Queue total from "Showing x of N tickets." */
async function queueTotal(page: Page): Promise<number> {
  const summary = page.getByText(/^Showing \d+ of \d+ tickets\.$/);
  await expect(summary).toBeVisible();
  return Number((await summary.textContent())!.match(/of (\d+) tickets/)![1]);
}

test.describe.serial('IT Staff and Administrator Dashboard (E2E-L4-07, E2E-L4-08)', () => {
  const token = runToken('E2E-L4-07s');
  let ticketId: number;

  test('setup: a HIGH-priority Ticket with an open action assigned to the My Open Actions account', async ({ page }) => {
    ticketId = await prepareTicket(page, token);
    const priority = await apiAsPage(page, 'PATCH', `/api/staff/tickets/${ticketId}/priority`, { itPriority: 'HIGH' });
    expect(priority.ok()).toBe(true);
    // A dedicated assignee (reset by global-setup.ts) keeps this action among the 5 oldest listed.
    const staff: Array<{ id: number; email: string }> = await (await apiAsPage(page, 'GET', '/api/staff/users')).json();
    const assigneeId = staff.find((u) => u.email === E2E_USERS.staffActions.email)!.id;
    await createActionViaApi(page, ticketId, `${token} Check the laptop battery health report.`, { assigneeId });
    await signOut(page);
  });

  test('E2E-L4-07: sign-in opens the Dashboard; every Ticket card drills down to an equal, filtered Queue', async ({ page }) => {
    await loginAs(page, 'staff');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('header').getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');

    const cards = await staffCards(page, STAFF_GRIDS);
    expect(cards.length).toBe(12);
    for (const [name, value] of cards) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(/\/staff\/tickets\?/);
      await expect(page.getByRole('status', { name: 'Filtered from Dashboard' })).toBeVisible();
      expect(await queueTotal(page), name).toBe(value);
      if (name.startsWith('Unassigned:')) {
        await expect(page.locator('#queue-owner-filter')).toHaveValue('unassigned');
        await page.screenshot({ path: lab4Screenshot('staff-dashboard', 'drilldown-unassigned'), fullPage: true });
      }
      await openStaffDashboard(page);
    }
  });

  test('E2E-L4-07: a My Open Actions row opens the Ticket at Actions Taken; Urgent "View all" filters the Queue', async ({ page }) => {
    await loginAs(page, 'staffActions');
    const actions = page.getByRole('region', { name: 'My Open Actions' });
    const row = actions.getByRole('listitem').filter({ hasText: `${token} Check the laptop battery` });
    await expect(row).toContainText('Planned');
    await row.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/staff/tickets/${ticketId}#actions-taken$`));
    await expect(page.getByRole('heading', { name: /^Actions Taken \(\d+\)$/ })).toBeFocused();

    await openStaffDashboard(page);
    await page.getByRole('link', { name: 'View all Urgent Tickets' }).click();
    await expect(page).toHaveURL(/\/staff\/tickets\?itPriority=HIGH&statusGroup=active&sortBy=createdAt&sortOrder=asc$/);
    await expect(page.locator('#queue-it-priority-filter')).toHaveValue('HIGH');
  });

  test('E2E-L4-07: Administrator user-account cards drill to an equal, filtered User Management', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 2, name: 'User Accounts' })).toBeVisible();
    await page.screenshot({ path: lab4Screenshot('staff-dashboard', 'admin-dashboard-desktop'), fullPage: true });

    const names = await page
      .getByRole('list', { name: 'User Accounts' })
      .getByRole('link')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    expect(names).toHaveLength(4);
    for (const name of names) {
      const value = Number(name.match(/: (\d+)\./)![1]);
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/users\?/);
      const total = page.getByText(/^\d+ users?$/);
      const none = page.getByText('No users match your filters.');
      await expect(total.or(none)).toBeVisible();
      const shown = (await none.isVisible()) ? 0 : Number((await total.textContent())!.split(' ')[0]);
      expect(shown, name).toBe(value);
      await openStaffDashboard(page);
    }
  });

  test('E2E-L4-08: an injected 500 shows the retryable safe error, and Retry recovers', async ({ page }) => {
    await loginAs(page, 'staff');
    await expect(page.getByRole('list', { name: 'Ticket status' })).toBeVisible();
    await page.route('**/api/dashboard/staff', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'INTERNAL_ERROR', stack: 'at app.ts:610' }) }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Something went wrong. Please try again.');
    await expect(page.getByText(/app\.ts|INTERNAL_ERROR/)).toHaveCount(0);
    await page.screenshot({ path: lab4Screenshot('staff-dashboard', 'staff-dashboard-error'), fullPage: true });
    await page.unroute('**/api/dashboard/staff');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('list', { name: 'Ticket status' })).toBeVisible();
  });

  test('E2E-L4-08: a Requester is refused the staff dashboard API and the staff screens', async ({ page }) => {
    await loginAs(page, 'requester');
    const res = await apiAsPage(page, 'GET', '/api/dashboard/staff');
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe('FORBIDDEN_ROLE');
    await page.goto('/staff/tickets');
    await expect(page.getByTestId('forbidden-state')).toBeVisible();
    await page.screenshot({ path: lab4Screenshot('staff-dashboard', 'forbidden-staff-dashboard'), fullPage: true });
  });

  for (const [viewportName, viewport] of Object.entries(VIEWPORTS) as [ViewportName, (typeof VIEWPORTS)[ViewportName]][]) {
    test(`layout at ${viewportName}: no horizontal scroll, every card row visible`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, 'staff');
      for (const grid of STAFF_GRIDS) await expect(page.getByRole('list', { name: grid })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'My Open Actions' })).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.mouse.move(0, 0); // no hover state in the evidence screenshot
      await page.screenshot({ path: lab4Screenshot('staff-dashboard', `${viewportName}-staff-dashboard`), fullPage: true });
    });
  }
});

test('E2E-L4-09: IT Staff with no work see 0 My Assigned and an empty My Open Actions', async ({ page }) => {
  await loginAs(page, 'staffEmpty');
  await expect(page.getByRole('link', { name: 'My Assigned: 0. View tickets' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My Open Actions: 0. View the list below' })).toBeVisible();
  await expect(page.getByText('You have no planned or in-progress actions.')).toBeVisible();
  await page.screenshot({ path: lab4Screenshot('staff-dashboard', 'staff-dashboard-empty'), fullPage: true });

  // A zero card still opens its (empty) list.
  await page.getByRole('link', { name: 'My Assigned: 0. View tickets' }).click();
  await expect(page).toHaveURL(/\/staff\/tickets\?ticketOwnerId=\d+&statusGroup=active$/);
  expect(await queueTotal(page)).toBe(0);
});
