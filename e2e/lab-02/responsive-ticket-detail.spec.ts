import { test, expect } from '@playwright/test';
import {
  REQUESTERS,
  TEST_IMAGE_PATH,
  VIEWPORTS,
  assertNoHorizontalScroll,
  createTicketViaUi,
  screenshotPath,
  selectRequester,
} from './helpers';

for (const [viewportName, viewportSize] of Object.entries(VIEWPORTS)) {
  test.describe(`RESP-03: Ticket Detail at ${viewportName} (${viewportSize.width}x${viewportSize.height})`, () => {
    test.use({ viewport: viewportSize });

    test('renders read-only fields and every attachment state without horizontal scroll', async ({ page }) => {
      const runToken = `RESP03-${Date.now()}`;

      await selectRequester(page, REQUESTERS.A);
      await createTicketViaUi(page, {
        category: 'Account and Access',
        relatedSystem: 'Campus Wi-Fi',
        priority: 'MEDIUM',
        summary: `${runToken} cannot connect to campus Wi-Fi`,
        description: 'The laptop repeatedly fails to authenticate against the campus Wi-Fi network since this morning.',
      });
      await page.getByRole('button', { name: 'View Ticket' }).click();
      await page.waitForURL('**/tickets/*');

      const attachmentSection = page.getByTestId('attachment-section');

      // 1. Add-attachment state: the picker control before anything has been added (ui-spec.md §9)
      await expect(attachmentSection).toContainText('0 / 5 attachments');
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: screenshotPath('ticket-detail', `${viewportName}-add-attachment`),
        fullPage: true,
      });

      // 2. Active-attachments state (AC-21)
      await page.locator('#add-attachment-input').setInputFiles(TEST_IMAGE_PATH);
      await expect(attachmentSection).toContainText('1 / 5 attachments');
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: screenshotPath('ticket-detail', `${viewportName}-active-attachments`),
        fullPage: true,
      });

      // 3. Removed-attachment state (AC-23, AC-24)
      const activeRow = page.getByTestId('active-attachments-list').locator('li').first();
      await activeRow.getByRole('button', { name: 'Remove' }).click();
      await page
        .getByPlaceholder('Why is this attachment being removed? (3-200 characters)')
        .fill('Wrong screenshot attached by mistake');
      await page.getByRole('button', { name: 'Confirm Removal' }).click();
      await expect(page.getByTestId('removed-attachments-list').getByText('Removed', { exact: true })).toBeVisible();
      await assertNoHorizontalScroll(page);
      await page.screenshot({
        path: screenshotPath('ticket-detail', `${viewportName}-removed-attachment`),
        fullPage: true,
      });
    });
  });
}
