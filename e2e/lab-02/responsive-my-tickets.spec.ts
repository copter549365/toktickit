import { test, expect } from '@playwright/test';
import {
  REQUESTERS,
  VIEWPORTS,
  assertNoHorizontalScroll,
  changeRequester,
  createTicketViaUi,
  screenshotPath,
  selectRequester,
} from './helpers';

/**
 * The desktop table and mobile card layouts both exist in the DOM at every viewport (CSS
 * `d-none`/`d-md-none` just hides one), so a plain `getByText` matches both and trips Playwright's
 * strict mode. Scope to whichever container is actually visible at this viewport.
 */
function visibleListContainer(page: import('@playwright/test').Page, viewportName: string) {
  return viewportName === 'mobile' ? page.locator('.d-md-none.d-flex.flex-column') : page.getByTestId('my-tickets-table');
}

/** Rows/cards inside whichever layout is visible at this viewport (see `visibleListContainer`). */
function visibleListItems(page: import('@playwright/test').Page, viewportName: string) {
  return viewportName === 'mobile'
    ? page.locator('[data-testid^="ticket-card-"]')
    : page.locator('[data-testid^="ticket-row-"]');
}

for (const [viewportName, viewportSize] of Object.entries(VIEWPORTS)) {
  test.describe(`RESP-01: My Tickets at ${viewportName} (${viewportSize.width}x${viewportSize.height})`, () => {
    test.use({ viewport: viewportSize });

    test('renders every documented state without horizontal scroll or clipped values', async ({ page }) => {
      const runToken = `RESP01-${Date.now()}`;

      await selectRequester(page, REQUESTERS.A);
      await createTicketViaUi(page, {
        category: 'Network',
        relatedSystem: 'VPN',
        priority: 'HIGH',
        summary: `${runToken} VPN disconnects every few minutes`,
        description: 'The corporate VPN drops the connection roughly every five minutes while working remotely.',
      });
      await page.goto('/tickets');
      await page.locator('#tickets-search-input').fill(runToken);

      // 1. Populated state (ui-spec.md §9). Waiting for the row count to settle to exactly one
      // (rather than just the summary text becoming visible) avoids screenshotting the stale,
      // unfiltered initial list: the new ticket sorts to the top of that unfiltered list too, so
      // a plain visibility check would pass before the debounced search request lands.
      const listContainer = visibleListContainer(page, viewportName);
      await expect(visibleListItems(page, viewportName)).toHaveCount(1);
      await expect(listContainer.getByText(`${runToken} VPN disconnects every few minutes`)).toBeVisible();
      await assertNoHorizontalScroll(page);

      if (viewportName === 'mobile') {
        // RESP-01: mobile renders stacked cards, not the desktop table.
        await expect(page.getByTestId('my-tickets-table')).toBeHidden();
      }

      await page.screenshot({ path: screenshotPath('my-tickets', `${viewportName}-populated`), fullPage: true });

      // 2. Empty state: zero tickets ever, no filters applied (AC-15). The four active seed
      // Requesters accumulate fixture tickets across every dev/test run, so a real zero-ticket
      // Requester cannot be relied on to exist; the response is simulated here to capture this
      // state deterministically (the underlying code path is exercised for real by UI-07).
      await page.route('**/api/tickets?*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 1 } }),
        }),
      );
      // Re-navigate (rather than clearing the already-empty search box, a no-op) so the mocked
      // route intercepts a fresh, filter-free initial load.
      await page.goto('/tickets');
      await expect(page.getByText("You haven't created any tickets yet.")).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({ path: screenshotPath('my-tickets', `${viewportName}-empty`), fullPage: true });
      await page.unroute('**/api/tickets?*');

      // 3. No-results state: a real search against the live backend that matches nothing (AC-14)
      await page.locator('#tickets-search-input').fill(`${runToken}-no-such-ticket-exists`);
      await expect(page.getByText('No tickets match your filters.')).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({ path: screenshotPath('my-tickets', `${viewportName}-no-results`), fullPage: true });

      // 4. Cross-requester isolation (AC-11, AC-12): A's ticket is visible, B's list does not have it.
      await page.locator('#tickets-search-input').fill(runToken);
      await expect(visibleListItems(page, viewportName)).toHaveCount(1);
      await page.screenshot({
        path: screenshotPath('my-tickets', `${viewportName}-cross-requester-isolation-a`),
        fullPage: true,
      });

      await changeRequester(page, REQUESTERS.B);
      await page.locator('#tickets-search-input').fill(runToken);
      await expect(page.getByText('No tickets match your filters.')).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: screenshotPath('my-tickets', `${viewportName}-cross-requester-isolation-b`),
        fullPage: true,
      });
    });
  });
}
