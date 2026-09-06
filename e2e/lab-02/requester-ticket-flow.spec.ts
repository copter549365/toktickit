import { test, expect } from '@playwright/test';
import {
  REQUESTERS,
  TEST_IMAGE_PATH,
  activeElementHasVisibleFocusRing,
  changeRequester,
  createTicketViaUi,
  selectRequester,
  tabTo,
} from './helpers';

const API_URL = 'http://localhost:3000';

test.describe('E2E-01: Select a Development Requester, create a valid ticket, see the generated Ticket Number', () => {
  test('the number shown on success matches what My Tickets later shows', async ({ page }) => {
    const runToken = `E2E01-${Date.now()}`;

    await selectRequester(page, REQUESTERS.A);

    const ticketNumber = await createTicketViaUi(page, {
      category: 'Hardware',
      relatedSystem: 'Corporate Laptop',
      priority: 'MEDIUM',
      summary: `${runToken} laptop battery drains quickly`,
      description: 'The laptop battery drains from full to empty within about an hour of unplugging.',
    });
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);

    await page.goto('/tickets');
    await page.locator('#tickets-search-input').fill(runToken);
    await expect(page.getByTestId('my-tickets-table')).toContainText(ticketNumber);
  });
});

test.describe('E2E-02: Requester isolation holds in both directions after a context switch', () => {
  test('AC-11, AC-12: switching from A to B hides A\'s ticket; switching back shows it again', async ({ page }) => {
    const runToken = `E2E02-${Date.now()}`;

    await selectRequester(page, REQUESTERS.A);
    const ticketNumber = await createTicketViaUi(page, {
      category: 'Software',
      relatedSystem: 'Email',
      priority: 'LOW',
      summary: `${runToken} cannot send email attachments`,
      description: 'Outgoing emails with attachments over 2 MB fail to send with a timeout error.',
    });

    await page.goto('/tickets');
    await page.locator('#tickets-search-input').fill(runToken);
    await expect(page.getByTestId('my-tickets-table')).toContainText(ticketNumber);

    await changeRequester(page, REQUESTERS.B);
    await page.locator('#tickets-search-input').fill(runToken);
    await expect(page.getByText('No tickets match your filters.')).toBeVisible();

    await changeRequester(page, REQUESTERS.A);
    await page.locator('#tickets-search-input').fill(runToken);
    await expect(page.getByTestId('my-tickets-table')).toContainText(ticketNumber);
  });
});

test.describe('E2E-03: Full attachment lifecycle from an owned Ticket Detail', () => {
  test('AC-22, AC-23, AC-24: add an attachment, soft-remove it with a reason, confirm download is blocked', async ({
    page,
    request,
  }) => {
    const runToken = `E2E03-${Date.now()}`;

    await selectRequester(page, REQUESTERS.A);
    await createTicketViaUi(page, {
      category: 'Hardware',
      relatedSystem: 'Printer',
      priority: 'MEDIUM',
      summary: `${runToken} printer jams on double-sided prints`,
      description: 'The office printer jams every time a double-sided print job larger than 5 pages is sent.',
    });

    await page.getByRole('button', { name: 'View Ticket' }).click();
    await page.waitForURL('**/tickets/*');

    const attachmentSection = page.getByTestId('attachment-section');
    await expect(attachmentSection).toContainText('0 / 5 attachments');

    await page.locator('#add-attachment-input').setInputFiles(TEST_IMAGE_PATH);
    await expect(attachmentSection).toContainText('1 / 5 attachments');
    await expect(attachmentSection.getByText('test-photo.png')).toBeVisible();

    const activeRow = page.getByTestId('active-attachments-list').locator('li').first();
    const attachmentUrl = page.url();
    const attachmentId = await page.evaluate(async (url) => {
      const ticketId = url.split('/tickets/')[1];
      const requesterId = JSON.parse(sessionStorage.getItem('toktickit.actingRequester') || '{}').id;
      const res = await fetch(`http://localhost:3000/api/tickets/${ticketId}`, {
        headers: { 'x-requester-id': String(requesterId) },
      });
      const data = await res.json();
      return data.attachments[0].id as number;
    }, attachmentUrl);

    await activeRow.getByRole('button', { name: 'Remove' }).click();
    await page.getByPlaceholder('Why is this attachment being removed? (3-200 characters)').fill(
      'Wrong screenshot attached by mistake',
    );
    await page.getByRole('button', { name: 'Confirm Removal' }).click();

    await expect(attachmentSection).toContainText('0 / 5 attachments');
    await expect(page.getByTestId('removed-attachments-list').getByText('Removed', { exact: true })).toBeVisible();
    await expect(attachmentSection.getByRole('button', { name: 'Download' })).toBeDisabled();

    // AC-24 explicitly requires this to hold for a direct API call too, not just the hidden UI control.
    const requesterId = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('toktickit.actingRequester') || '{}').id,
    );
    const downloadResponse = await request.get(`${API_URL}/api/attachments/${attachmentId}/download`, {
      headers: { 'x-requester-id': String(requesterId) },
    });
    expect(downloadResponse.status()).toBe(404);
  });
});

test.describe('E2E-04: Search, filter, and paginate My Tickets to find a specific ticket', () => {
  test('AC-13, AC-16, AC-17', async ({ page, request }) => {
    const runToken = `E2E04-${Date.now()}`;

    // Seed enough owned tickets via the real API to guarantee a second page exists, so the
    // pagination leg of this journey is deterministic rather than depending on however many
    // tickets already happen to exist for this Requester in the shared dev database.
    const requestersRes = await request.get(`${API_URL}/api/requesters`);
    const requesters = await requestersRes.json();
    const requesterA = requesters.find((r: { name: string }) => r.name === REQUESTERS.A);

    const categoriesRes = await request.get(`${API_URL}/api/categories`);
    const categories = await categoriesRes.json();
    const hardware = categories.find((c: { name: string }) => c.name === 'Hardware');
    const network = categories.find((c: { name: string }) => c.name === 'Network');

    const systemsRes = await request.get(`${API_URL}/api/related-systems`);
    const systems = await systemsRes.json();
    const laptop = systems.find((s: { name: string }) => s.name === 'Corporate Laptop');

    for (let i = 0; i < 11; i++) {
      await request.post(`${API_URL}/api/tickets`, {
        headers: { 'x-requester-id': String(requesterA.id) },
        data: {
          categoryId: i === 0 ? hardware.id : network.id,
          relatedSystemId: laptop.id,
          summary: `${runToken} filler ticket ${i}`,
          description: 'Filler ticket created directly via the API to guarantee a second page exists.',
          requestedPriority: i === 0 ? 'HIGH' : 'LOW',
        },
      });
    }

    await selectRequester(page, REQUESTERS.A);
    await page.goto('/tickets');

    // Search: finds only the one ticket matching a specific summary fragment.
    await page.locator('#tickets-search-input').fill(`${runToken} filler ticket 0`);
    await expect(page.getByTestId('my-tickets-table').locator('tbody tr')).toHaveCount(1);

    // Filter: scoping to Category=Hardware + Requested Priority=High narrows to that same one ticket.
    await page.locator('#tickets-search-input').fill(runToken);
    await page.locator('#tickets-category-filter').selectOption({ label: 'Hardware' });
    await page.locator('#tickets-priority-filter').selectOption({ label: 'High' });
    await expect(page.getByTestId('my-tickets-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('my-tickets-table')).toContainText('filler ticket 0');

    // Paginate: clearing the priority filter but keeping the search brings back all 11 fillers,
    // which is more than one page (default page size 10), so Next must reveal a different slice.
    await page.locator('#tickets-priority-filter').selectOption({ label: 'All Priorities' });
    await page.locator('#tickets-category-filter').selectOption({ label: 'All Categories' });
    await expect(page.getByTestId('my-tickets-table').locator('tbody tr')).toHaveCount(10);
    const firstPageFirstRow = await page.getByTestId('my-tickets-table').locator('tbody tr').first().innerText();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('my-tickets-table').locator('tbody tr')).toHaveCount(1);
    const secondPageFirstRow = await page.getByTestId('my-tickets-table').locator('tbody tr').first().innerText();
    expect(secondPageFirstRow).not.toBe(firstPageFirstRow);
  });
});

test.describe('E2E-05: Keyboard-only pass through Requester Selection and Create Ticket', () => {
  test('AC-28: every control is reachable via Tab and shows a visible focus indicator', async ({ page }) => {
    await page.goto('/select-requester');

    await tabTo(page, page.locator('#requester-select'));
    expect(await activeElementHasVisibleFocusRing(page)).toBe(true);
    await page.locator('#requester-select').selectOption({ label: REQUESTERS.A });

    await tabTo(page, page.getByRole('button', { name: 'Continue' }));
    expect(await activeElementHasVisibleFocusRing(page)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForURL('**/tickets');

    await tabTo(page, page.getByRole('link', { name: 'Create Ticket' }));
    expect(await activeElementHasVisibleFocusRing(page)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForURL('**/tickets/new');

    await tabTo(page, page.locator('#category-select'));
    expect(await activeElementHasVisibleFocusRing(page)).toBe(true);
    await page.locator('#category-select').selectOption({ label: 'Hardware' });

    await tabTo(page, page.locator('#related-system-select'));
    await page.locator('#related-system-select').selectOption({ label: 'Corporate Laptop' });

    await tabTo(page, page.locator('#priority-select'));
    expect(await activeElementHasVisibleFocusRing(page)).toBe(true);

    await tabTo(page, page.locator('#summary-input'));
    expect(await activeElementHasVisibleFocusRing(page)).toBe(true);
    await page.keyboard.type(`E2E05-${Date.now()} keyboard-only submission test`);

    await tabTo(page, page.locator('#description-textarea'));
    expect(await activeElementHasVisibleFocusRing(page)).toBe(true);
    await page.keyboard.type('Submitted entirely via keyboard navigation to verify AC-28 tab order and focus visibility.');

    await tabTo(page, page.getByRole('button', { name: 'Submit Ticket' }));
    expect(await activeElementHasVisibleFocusRing(page)).toBe(true);
    await page.keyboard.press('Enter');

    await expect(page.getByText('Ticket Created Successfully')).toBeVisible();
  });
});
