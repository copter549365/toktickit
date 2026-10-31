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
import { prepareTicket } from './helpers';

/**
 * E2E-L4-07, E2E-L4-08, E2E-L4-09 — Requester parts (docs/lab-04/tests.md §2.8). The IT Staff and
 * Administrator parts are added with their dashboard (Issue 7).
 * - L4-07: each Requester card opens My Tickets with the filter in the URL and the controls, and
 *   the list total equals the card value. List rows open the Ticket.
 * - L4-08: an injected 500 shows the retryable safe error, and Retry recovers.
 * - L4-09: a Requester with no tickets sees every card at 0 and the "Create your first ticket" CTA.
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
