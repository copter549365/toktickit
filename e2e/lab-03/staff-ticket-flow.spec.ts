import { test, expect, type Page } from '@playwright/test';
import { E2E_USERS } from './fixtures';
import { apiAsPage, createTicketViaUi, loginAs, runToken, screenshotPath, signOut } from './helpers';

/**
 * E2E-03, E2E-04, E2E-07 (docs/lab-03/tests.md): the full operational lifecycle of one Ticket across
 * the Requester and IT Staff roles — queue search/filter, claim, IT Priority, permitted status
 * changes, Public Comments vs Internal Notes, "Problem Appears Resolved", reassignment, and
 * formal resolution — plus direct-API authorization checks.
 */

async function searchQueue(page: Page, text: string) {
  await page.locator('#queue-search-input').fill(text);
  // The search box is debounced (300ms); wait for the result count to reflect this search.
  await expect(page.locator('[data-testid^="queue-row-"]')).toHaveCount(1);
}

test.describe.serial('E2E-03 / E2E-04 / E2E-07: Ticket lifecycle across Requester and IT Staff', () => {
  const token = runToken('E2E-FLOW');
  const summary = `${token} Projector in Room 402 shows no signal`;
  const publicReply = `${token} public: we are sending a technician to Room 402.`;
  const internalNote = `${token} internal: HDMI switch firmware is suspect, do not tell requester yet.`;
  const requesterComment = `${token} requester: thanks, the room is free after 2pm.`;
  let ticketId = '';
  let ticketNumber = '';

  test('Requester creates a Ticket (Lab 2 flow under real auth)', async ({ page }) => {
    await loginAs(page, 'requester');
    ticketNumber = await createTicketViaUi(page, {
      category: 'Hardware',
      relatedSystem: 'Printer',
      priority: 'LOW',
      summary,
      description: 'The ceiling projector in Room 402 reports "no signal" from both HDMI inputs since this morning.',
    });
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
  });

  test('IT Staff finds it in the queue via search and filters, then claims it and sets IT Priority and status', async ({ page }) => {
    await loginAs(page, 'staff');
    await expect(page.getByRole('heading', { name: 'IT Staff Ticket Queue' })).toBeVisible();

    await searchQueue(page, token);
    const row = page.locator('[data-testid^="queue-row-"]').first();
    await expect(row).toContainText(ticketNumber);
    await expect(row).toContainText('Unassigned');
    await expect(row).toContainText('New');

    // Combine filters that must still include the new Ticket, and one that must exclude it.
    await page.locator('#queue-owner-filter').selectOption('unassigned');
    await page.locator('#queue-status-filter').selectOption('NEW');
    await page.locator('#queue-requested-priority-filter').selectOption('LOW');
    await expect(page.locator('[data-testid^="queue-row-"]')).toHaveCount(1);
    await page.screenshot({ path: screenshotPath('staff-queue', 'queue-filtered-status-priority'), fullPage: true });

    await page.locator('#queue-requested-priority-filter').selectOption('HIGH');
    await expect(page.getByText('No tickets match your filters.')).toBeVisible();
    await page.screenshot({ path: screenshotPath('staff-queue', 'queue-no-results-state'), fullPage: true });
    await page.getByRole('button', { name: 'Reset Filters' }).click();
    await expect(page.locator('#queue-search-input')).toHaveValue('');

    await searchQueue(page, token);
    await page.locator('[data-testid^="queue-row-"]').first().getByRole('button', { name: 'Open' }).click();
    await page.waitForURL(/\/staff\/tickets\/\d+$/);
    ticketId = page.url().split('/').pop()!;
    await expect(page.getByRole('heading', { name: ticketNumber })).toBeVisible();

    // Requester-authored fields are read-only; operational fields are editable.
    await expect(page.locator('#detail-summary')).toHaveClass(/field-readonly/);
    await expect(page.locator('#owner-select')).toHaveClass(/field-editable/);

    // Claim.
    await page.getByRole('button', { name: 'Claim Ticket' }).click();
    await expect(page.locator('#owner-select option:checked')).toHaveText(E2E_USERS.staff.name);
    await expect(page.getByRole('button', { name: 'Claim Ticket' })).toBeDisabled();

    // IT Priority: differs from the Requested Priority (LOW) and does not overwrite it.
    await page.locator('#priority-select').selectOption('HIGH');
    await page.getByRole('button', { name: 'Save Priority' }).click();
    await expect(page.locator('#priority-select')).toHaveValue('HIGH');
    await expect(page.locator('#detail-requested-priority')).toContainText('Low');

    // Only permitted transitions are offered; NEW cannot jump straight to RESOLVED/CLOSED.
    const offered = await page.locator('#status-select option:not([disabled])').allTextContents();
    expect(offered).toEqual(['Open', 'In Progress', 'Cancelled']);
    await page.locator('#status-select').selectOption('IN_PROGRESS');
    await page.getByRole('button', { name: 'Save Status' }).click();
    await expect(page.locator('h1 ~ .zg-badge')).toHaveText('In Progress');

    // Server rejects a transition the UI would never offer (IN_PROGRESS -> REOPENED).
    const invalid = await apiAsPage(page, 'PATCH', `/api/staff/tickets/${ticketId}/status`, { status: 'REOPENED' });
    expect((await invalid.json()).error).toBe('INVALID_STATUS_TRANSITION');
    expect(invalid.status()).toBe(400);

    await page.screenshot({ path: screenshotPath('staff-ticket-detail', 'ticket-detail-claim-and-reassign'), fullPage: true });
  });

  test('IT Staff posts a Public Comment and a visually distinct Internal Note', async ({ page }) => {
    await loginAs(page, 'staff');
    await page.goto(`/staff/tickets/${ticketId}`);

    const comments = page.getByTestId('public-comments-section');
    const notes = page.getByTestId('internal-notes-section');

    // Empty-message submit is blocked.
    await expect(comments.getByRole('button', { name: 'Post Comment' })).toBeDisabled();

    await comments.locator('#new-comment').fill(publicReply);
    await comments.getByRole('button', { name: 'Post Comment' }).click();
    await expect(comments.getByText(publicReply)).toBeVisible();

    await notes.locator('#new-note').fill(internalNote);
    await notes.getByRole('button', { name: 'Save Internal Note' }).click();
    await expect(notes.getByText(internalNote)).toBeVisible();

    // Each message appears only in its own panel.
    await expect(comments.getByText(internalNote)).toHaveCount(0);
    await expect(notes.getByText(publicReply)).toHaveCount(0);
    await expect(notes).toHaveClass(/zg-internal-notes-panel/);
    await expect(notes.getByText(/Visible ONLY to IT Staff and Administrators/)).toBeVisible();

    await comments.scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshotPath('staff-ticket-detail', 'ticket-detail-public-comments'), fullPage: true });
    await notes.screenshot({ path: screenshotPath('staff-ticket-detail', 'ticket-detail-internal-notes-amber-warning') });
  });

  test('Requester sees the operational update and Public Comment, never the Internal Note, and indicates resolution', async ({ page }) => {
    await loginAs(page, 'requester');
    await page.goto(`/tickets/${ticketId}`);

    await expect(page.locator('#detail-current-status')).toContainText('In Progress');
    await expect(page.locator('#detail-it-priority')).toContainText('High');
    await expect(page.locator('#detail-ticket-owner')).toHaveValue(E2E_USERS.staff.name);

    const thread = page.getByTestId('comment-thread');
    await expect(thread.getByText(publicReply)).toBeVisible();
    await expect(page.getByText(internalNote)).toHaveCount(0);
    await expect(page.getByText(/Internal Note/i)).toHaveCount(0);

    // AC-04: the Internal Note API refuses a Requester without leaking any note content.
    const notesResponse = await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/notes`);
    expect(notesResponse.status()).toBe(403);
    expect(await notesResponse.text()).not.toContain(token);
    // Nor can the Requester use IT Staff operations on their own ticket.
    const staffDetail = await apiAsPage(page, 'GET', `/api/staff/tickets/${ticketId}`);
    expect(staffDetail.status()).toBe(403);
    const claim = await apiAsPage(page, 'PATCH', `/api/staff/tickets/${ticketId}/owner`, { ticketOwnerId: null });
    expect(claim.status()).toBe(403);

    await thread.locator('#new-comment').fill(requesterComment);
    await thread.getByRole('button', { name: 'Post Comment' }).click();
    await expect(thread.getByText(requesterComment)).toBeVisible();

    await page.getByRole('button', { name: 'Problem Appears Resolved' }).click();
    await expect(page.getByTestId('resolved-indicator-confirmation')).toBeVisible();
    // Indicating resolution does not itself close or resolve the Ticket.
    await expect(page.locator('#detail-current-status')).toContainText('In Progress');
  });

  test('IT Staff sees the resolution indicator, reassigns, and formally resolves with a summary', async ({ page }) => {
    await loginAs(page, 'staff');
    await page.goto(`/staff/tickets/${ticketId}`);

    await expect(page.getByTestId('resolution-banner')).toBeVisible();
    await expect(page.getByTestId('public-comments-section').getByText(requesterComment)).toBeVisible();
    await page.screenshot({ path: screenshotPath('staff-ticket-detail', 'ticket-detail-requester-resolved-badge'), fullPage: true });

    // Reassign to another active IT Staff member.
    await page.locator('#owner-select').selectOption({ label: E2E_USERS.staffSecondary.name });
    await page.getByRole('button', { name: 'Save Owner' }).click();
    await expect(page.locator('#owner-select option:checked')).toHaveText(E2E_USERS.staffSecondary.name);
    await expect(page.getByRole('button', { name: 'Claim Ticket' })).toBeEnabled();

    // RESOLVED requires a confirmation with a resolution summary.
    await page.locator('#status-select').selectOption('RESOLVED');
    await page.getByRole('button', { name: 'Save Status' }).click();
    await expect(page.getByRole('heading', { name: 'Confirm transition to Resolved' })).toBeVisible();
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirm).toBeDisabled();
    await page.locator('#resolution-summary').fill('Replaced the HDMI switch; projector verified with two laptops.');
    await expect(confirm).toBeEnabled();
    await page.screenshot({ path: screenshotPath('staff-ticket-detail', 'ticket-detail-status-transition-modal'), fullPage: true });
    await confirm.click();

    await expect(page.getByRole('heading', { name: /Confirm transition/ })).toHaveCount(0);
    const offered = await page.locator('#status-select option:not([disabled])').allTextContents();
    expect(offered).toEqual(['Closed', 'Reopened']);

    // Queue reflects the new owner and status.
    await page.goto('/staff/tickets');
    await searchQueue(page, token);
    const row = page.locator('[data-testid^="queue-row-"]').first();
    await expect(row).toContainText(E2E_USERS.staffSecondary.name);
    await expect(row).toContainText('Resolved');
  });
});

test.describe('E2E-08: IT Staff Ticket Queue sort, pagination, and feedback states', () => {
  test('sorting and pagination change the query and the rendered rows', async ({ page }) => {
    await loginAs(page, 'staff');
    const rows = page.locator('[data-testid^="queue-row-"]');
    await expect(rows.first()).toBeVisible();

    const sortRequest = page.waitForRequest((r) => r.url().includes('/api/staff/tickets?') && r.url().includes('sortBy=itPriority'));
    await page.getByRole('button', { name: 'Sort by IT Priority' }).click();
    await sortRequest;
    await expect(page.getByRole('button', { name: 'Sort by IT Priority' })).toContainText('▲');

    await page.locator('#queue-page-size').selectOption('10');
    const pagination = page.getByRole('navigation', { name: 'Ticket Queue pagination' });
    if (await pagination.isVisible()) {
      const firstPageNumbers = await rows.locator('td.font-monospace').allTextContents();
      await pagination.getByRole('button', { name: 'Next' }).click();
      await expect(pagination.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
      const secondPageNumbers = await rows.locator('td.font-monospace').allTextContents();
      expect(secondPageNumbers.some((n) => firstPageNumbers.includes(n))).toBe(false);
    }
  });

  test('empty queue and API failure render distinct, safe states', async ({ page }) => {
    await loginAs(page, 'staff');

    await page.route('**/api/staff/tickets?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 1 } }),
      }),
    );
    await page.reload();
    await expect(page.getByText('No tickets in queue.')).toBeVisible();
    await page.screenshot({ path: screenshotPath('staff-queue', 'queue-empty-state'), fullPage: true });
    await page.unroute('**/api/staff/tickets?*');

    await page.route('**/api/staff/tickets?*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'INTERNAL_ERROR', stack: 'SECRET-STACK' }) }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Unable to load the ticket queue. Please try again.');
    await expect(page.getByText('SECRET-STACK')).toHaveCount(0);
    await page.screenshot({ path: screenshotPath('staff-queue', 'queue-api-failure'), fullPage: true });
    await page.unroute('**/api/staff/tickets?*');

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('[data-testid^="queue-row-"]').first()).toBeVisible();
  });

  test('a Requester is shown a forbidden state on the IT Staff screens, and the API refuses them', async ({ page }) => {
    await loginAs(page, 'requester');
    await page.goto('/staff/tickets');
    await expect(page.getByTestId('forbidden-state')).toBeVisible();
    await expect(page.locator('#queue-search-input')).toHaveCount(0);
    const queue = await apiAsPage(page, 'GET', '/api/staff/tickets');
    expect(queue.status()).toBe(403);
    await page.screenshot({ path: screenshotPath('staff-queue', 'queue-forbidden-requester'), fullPage: true });
  });
});
