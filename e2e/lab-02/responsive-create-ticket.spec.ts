import { test, expect } from '@playwright/test';
import { REQUESTERS, VIEWPORTS, assertNoHorizontalScroll, screenshotPath, selectRequester } from './helpers';

for (const [viewportName, viewportSize] of Object.entries(VIEWPORTS)) {
  test.describe(`RESP-02: Create Ticket at ${viewportName} (${viewportSize.width}x${viewportSize.height})`, () => {
    test.use({ viewport: viewportSize });

    test('renders every documented state without horizontal scroll or clipped labels', async ({ page }) => {
      const runToken = `RESP02-${Date.now()}`;

      await selectRequester(page, REQUESTERS.A);
      await page.goto('/tickets/new');

      // 1. Initial state (ui-spec.md §9)
      await assertNoHorizontalScroll(page);
      await page.screenshot({ path: screenshotPath('create-ticket', `${viewportName}-initial`), fullPage: true });

      // 2. Validation-error state: submit with blank Summary/Description (AC-04, AC-05)
      await page.getByRole('button', { name: 'Submit Ticket' }).click();
      await expect(page.getByText('Summary is required.')).toBeVisible();
      await expect(page.getByText('Description is required.')).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: screenshotPath('create-ticket', `${viewportName}-validation-error`),
        fullPage: true,
      });

      await page.locator('#summary-input').fill(`${runToken} keyboard shortcut stopped working`);
      await page
        .locator('#description-textarea')
        .fill('The Ctrl+Shift+S shortcut stopped triggering the save-as dialog after the last update.');

      // 3. Submitting state: delay the POST response so the busy button is screenshot-able
      // (AC-10). Fulfilled with a mocked response (rather than delaying + continuing to the real
      // server) so this capture can't be affected by a real server round-trip; the request is
      // still real for every other capture in this suite, including the genuine POST in E2E-01.
      // Some runs surface a second, harmless invocation of this same route (observed across
      // different viewports, not just mobile — plausibly the browser retrying a request it has
      // held open for 800ms) which throws "Route is already handled" on the first call to
      // continue/fulfill; that's swallowed below since only one reply needs to land for the
      // busy -> success transition this test asserts.
      let handled = false;
      await page.route('**/api/tickets', async (route) => {
        if (route.request().method() !== 'POST' || handled) {
          await route.continue().catch(() => {});
          return;
        }
        handled = true;
        await new Promise((resolve) => setTimeout(resolve, 800));
        await route
          .fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 999999,
              ticketNumber: 'TKT-2026-999999',
              requesterId: 1,
              categoryId: 1,
              relatedSystemId: 1,
              summary: `${runToken} keyboard shortcut stopped working`,
              description: 'The Ctrl+Shift+S shortcut stopped triggering the save-as dialog after the last update.',
              requestedPriority: 'MEDIUM',
              itPriority: null,
              currentStatus: 'NEW',
              ticketOwnerId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          })
          .catch(() => {});
      });
      const submitButton = page.getByRole('button', { name: 'Submit Ticket' });
      await submitButton.scrollIntoViewIfNeeded();
      await submitButton.click();
      await expect(page.getByRole('button', { name: 'Submitting…' })).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({ path: screenshotPath('create-ticket', `${viewportName}-submitting`), fullPage: true });
      await page.unroute('**/api/tickets');

      // 4. Success state (AC-01)
      await expect(page.getByText('Ticket Created Successfully')).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({ path: screenshotPath('create-ticket', `${viewportName}-success`), fullPage: true });

      // 5. API-failure state: force the POST to fail, confirm the safe error + preserved values (AC-09)
      await page.goto('/tickets/new');
      const failureSummary = `${runToken} api failure case`;
      await page.locator('#summary-input').fill(failureSummary);
      await page
        .locator('#description-textarea')
        .fill('This submission is intentionally forced to fail to capture the safe-failure state.');
      let aborted = false;
      await page.route('**/api/tickets', async (route) => {
        if (route.request().method() !== 'POST' || aborted) {
          await route.continue().catch(() => {});
          return;
        }
        aborted = true;
        await route.abort('failed').catch(() => {});
      });
      const failureSubmitButton = page.getByRole('button', { name: 'Submit Ticket' });
      await failureSubmitButton.scrollIntoViewIfNeeded();
      await failureSubmitButton.dispatchEvent('click');
      await expect(page.getByText(/Unable to create ticket/i)).toBeVisible();
      await expect(page.locator('#summary-input')).toHaveValue(failureSummary);
      await assertNoHorizontalScroll(page);
      await page.screenshot({ path: screenshotPath('create-ticket', `${viewportName}-api-failure`), fullPage: true });
      await page.unroute('**/api/tickets');
    });
  });
}
