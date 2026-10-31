import type { Page } from '@playwright/test';
import { test, expect, lab4Screenshot } from './fixtures';
import { apiAsPage, loginAs, runToken, signOut } from '../lab-03/helpers';
import { actionRow, actionsSection, createActionViaApi, openStaffTicket, prepareTicket } from './helpers';

/**
 * E2E-L4-04, E2E-L4-05, and E2E-L4-06 (docs/lab-04/tests.md §2.8): the ticket workflow through the real UI.
 * - L4-04: Resolve blocked by an open action; complete it; resolve; close; history shows each step,
 *   and only the permitted next statuses are offered at every step.
 * - L4-06: RESOLVED → REOPENED (reason) → WAITING_FOR_REQUESTER; cancelling a Ticket auto-cancels
 *   its open action in the list.
 * - L4-05: the Requester's advisory signal leaves the status alone and shows on the staff dashboard.
 */

const statusSelect = (page: Page) => page.locator('#status-select');
const historyRegion = (page: Page) => page.getByRole('region', { name: /^Status History/ });

async function offeredStatuses(page: Page): Promise<string[]> {
  return statusSelect(page).locator('option:not([disabled])').allTextContents();
}

async function chooseStatus(page: Page, value: string) {
  await statusSelect(page).selectOption(value);
  await page.getByRole('button', { name: 'Save Status' }).click();
}

async function expectHeaderStatus(page: Page, label: string) {
  await expect(page.locator('h1').locator('..')).toContainText(label);
}

test.describe.serial('E2E-L4-04: resolution gate in the UI (AC-12, AC-17, AC-14)', () => {
  const token = runToken('E2E-L4-04');
  const actionText = `${token} Collected the VPN client logs.`;

  test('only permitted transitions are offered; Resolve is blocked until the open action is completed; then resolve and close', async ({ page }) => {
    const ticketId = await prepareTicket(page, token);
    await openStaffTicket(page, ticketId);

    expect(await offeredStatuses(page)).toEqual(['Open', 'In Progress', 'Cancelled']);
    await page.locator('#status-select').scrollIntoViewIfNeeded();
    await page.screenshot({ path: lab4Screenshot('workflow', 'permitted-transitions') });

    await chooseStatus(page, 'IN_PROGRESS');
    await expect(page.getByRole('status').filter({ hasText: 'Status changed to In Progress' })).toBeVisible();
    await expectHeaderStatus(page, 'In Progress');
    expect(await offeredStatuses(page)).toEqual(['Waiting for Requester', 'Resolved', 'Cancelled']);

    // An open action blocks the gate (BR-14 conditions 2 and 3).
    await createActionViaApi(page, ticketId, actionText, { status: 'IN_PROGRESS' });
    await chooseStatus(page, 'RESOLVED');
    let modal = page.getByRole('dialog', { name: 'Confirm transition to Resolved' });
    const checklist = modal.getByRole('list', { name: 'Resolution checklist' });
    await expect(checklist.getByRole('listitem').filter({ hasText: 'No planned or in-progress actions remain' })).toContainText('✗');
    await expect(checklist.getByRole('listitem').filter({ hasText: 'At least one action is completed' })).toContainText('✗');
    await expect(checklist.getByRole('listitem').filter({ hasText: 'Ticket has an owner' })).toContainText('✓');
    await modal.locator('#resolution-summary').fill('Reinstalled the VPN client and verified the connection.');
    await expect(modal.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
    await page.screenshot({ path: lab4Screenshot('workflow', 'resolve-gate-blocked') });

    // The backend enforces it too, whatever the UI shows.
    const direct = await apiAsPage(page, 'PATCH', `/api/staff/tickets/${ticketId}/status`, {
      status: 'RESOLVED',
      resolutionSummary: 'Trying to bypass the gate.',
    });
    expect(direct.status()).toBe(409);
    expect((await direct.json()).error).toBe('RESOLUTION_GATE_NOT_MET');

    await modal.getByRole('link', { name: 'Go to Actions Taken' }).click();
    await expect(modal).toHaveCount(0);

    // Complete the action in the UI.
    await (await actionRow(page, actionText)).getByRole('button', { name: /^Edit action/ }).click();
    const drawer = page.getByRole('dialog', { name: /^Action #\d+$/ });
    await drawer.getByLabel(/^Result/).fill('Logs show an expired certificate; renewed it.');
    await drawer.getByRole('button', { name: 'Mark Completed' }).click();
    await drawer.getByRole('button', { name: 'Confirm Completion' }).click();
    await expect(drawer.getByText('Completed actions are read-only')).toBeVisible();
    await page.keyboard.press('Escape');

    await chooseStatus(page, 'RESOLVED');
    modal = page.getByRole('dialog', { name: 'Confirm transition to Resolved' });
    await expect(modal.getByRole('list', { name: 'Resolution checklist' })).not.toContainText('✗');
    await modal.locator('#resolution-summary').fill('Renewed the expired VPN certificate; connection verified.');
    await modal.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Status changed to Resolved' })).toBeVisible();
    await expect(modal).toHaveCount(0);
    await expectHeaderStatus(page, 'Resolved');
    expect(await offeredStatuses(page)).toEqual(['Closed', 'Reopened']);
    await expect(actionsSection(page).getByRole('button', { name: 'Add Action' })).toHaveCount(0); // BR-09
    await page.screenshot({ path: lab4Screenshot('workflow', 'resolve-success'), fullPage: true });

    // Close without a new summary: the resolved one is kept.
    await chooseStatus(page, 'CLOSED');
    await page.getByRole('dialog', { name: 'Confirm transition to Closed' }).getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Status changed to Closed' })).toBeVisible();
    await expect(page.getByText('No further changes')).toBeVisible();
    await expect(statusSelect(page)).toHaveCount(0);

    const steps = historyRegion(page).getByRole('listitem');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText('New → In Progress');
    await expect(steps.nth(1)).toContainText('In Progress → Resolved');
    await expect(steps.nth(1)).toContainText('Renewed the expired VPN certificate; connection verified.');
    await expect(steps.nth(2)).toContainText('Resolved → Closed');
    await historyRegion(page).scrollIntoViewIfNeeded();
    await historyRegion(page).screenshot({ path: lab4Screenshot('workflow', 'status-history') });
  });
});

test.describe.serial('E2E-L4-06: reopen and cancel paths (AC-11, AC-16)', () => {
  test('RESOLVED → REOPENED with a reason → WAITING_FOR_REQUESTER', async ({ page }) => {
    const token = runToken('E2E-L4-06a');
    const ticketId = await prepareTicket(page, token);
    await createActionViaApi(page, ticketId, `${token} Replaced the charger.`, {
      status: 'COMPLETED',
      result: 'The laptop charges normally again.',
    });
    for (const body of [{ status: 'IN_PROGRESS' }, { status: 'RESOLVED', resolutionSummary: 'Replaced the charger.' }]) {
      expect((await apiAsPage(page, 'PATCH', `/api/staff/tickets/${ticketId}/status`, body)).ok()).toBe(true);
    }

    await openStaffTicket(page, ticketId);
    await chooseStatus(page, 'REOPENED');
    const modal = page.getByRole('dialog', { name: 'Confirm transition to Reopened' });
    const confirm = modal.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirm).toBeDisabled();
    await modal.locator('#reopen-reason').fill('The battery drains quickly again.');
    await confirm.click();
    await expectHeaderStatus(page, 'Reopened');
    expect(await offeredStatuses(page)).toEqual(['In Progress', 'Waiting for Requester', 'Resolved', 'Cancelled']);

    await chooseStatus(page, 'WAITING_FOR_REQUESTER'); // new in Lab 4 (D-07), no confirmation
    await expect(page.getByRole('status').filter({ hasText: 'Status changed to Waiting for Requester' })).toBeVisible();
    await expectHeaderStatus(page, 'Waiting for Requester');
    await expect(historyRegion(page).getByRole('listitem').last()).toContainText('Reopened → Waiting for Requester');
  });

  test('cancelling the Ticket auto-cancels its open action in the list', async ({ page }) => {
    const token = runToken('E2E-L4-06b');
    const ticketId = await prepareTicket(page, token);
    const description = `${token} Ordering a replacement battery.`;
    await createActionViaApi(page, ticketId, description);

    await openStaffTicket(page, ticketId);
    await expect(await actionRow(page, description)).toContainText('Planned');
    await chooseStatus(page, 'CANCELLED');
    await page.getByRole('dialog', { name: 'Confirm transition to Cancelled' }).getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Status changed to Cancelled' })).toBeVisible();

    const row = await actionRow(page, description);
    await expect(row).toContainText('Cancelled');
    await expect(row.getByRole('button', { name: /^Edit action/ })).toHaveCount(0);
    await row.getByRole('button', { name: /^View action/ }).click();
    await expect(page.getByRole('dialog', { name: /^Action #\d+$/ }).getByText('Ticket cancelled')).toBeVisible();
  });
});

test.describe.serial('E2E-L4-05: advisory Requester signal (AC-13, BR-16, FR-12)', () => {
  const token = runToken('E2E-L4-05');
  let ticketId: number;
  let before: number;

  const markedCard = (page: Page) =>
    page.getByRole('list', { name: 'Workload' }).getByRole('link', { name: /^Marked Resolved by Requester: \d+\./ });

  async function markedCount(page: Page): Promise<number> {
    const name = await markedCard(page).getAttribute('aria-label');
    return Number(name!.match(/: (\d+)\./)![1]);
  }

  test('setup: an In Progress Ticket, and the staff dashboard count before the signal', async ({ page }) => {
    ticketId = await prepareTicket(page, token);
    const res = await apiAsPage(page, 'PATCH', `/api/staff/tickets/${ticketId}/status`, { status: 'IN_PROGRESS' });
    expect(res.ok()).toBe(true);
    await page.goto('/dashboard');
    before = await markedCount(page);
    await signOut(page);
  });

  test('the Requester marks the problem as appearing resolved; the status does not change', async ({ page }) => {
    await loginAs(page, 'requester');
    await page.goto(`/tickets/${ticketId}`);
    await page.getByRole('button', { name: 'Problem Appears Resolved' }).click();
    await expect(page.getByTestId('resolved-indicator-confirmation')).toBeVisible();
    // The advisory signal leaves the status badge as it was (BR-16).
    await expect(page.locator('.zg-badge', { hasText: /^In Progress$/ }).first()).toBeVisible();
    const detail = await (await apiAsPage(page, 'GET', `/api/tickets/${ticketId}`)).json();
    expect(detail.currentStatus).toBe('IN_PROGRESS');
    expect(detail.requesterResolvedIndicator).toBe(true);
    await signOut(page);
  });

  test('the staff dashboard "Marked Resolved by Requester" goes up by 1 and drills to the Ticket', async ({ page }) => {
    await loginAs(page, 'staff');
    expect(await markedCount(page)).toBe(before + 1);
    await markedCard(page).click();
    await expect(page).toHaveURL(/\/staff\/tickets\?statusGroup=active&requesterResolvedIndicator=true$/);
    await expect(page.getByRole('checkbox', { name: 'Requester says resolved' })).toBeChecked();
    // The drill-down list may span pages, so find the Ticket by its token.
    await page.locator('#queue-search-input').fill(token);
    const row = page.getByTestId(`queue-row-${ticketId}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Requester says resolved');
    await page.screenshot({ path: lab4Screenshot('workflow', 'requester-signal-drilldown'), fullPage: true });
  });
});
