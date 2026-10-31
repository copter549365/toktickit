import type { Page, Route } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiAsPage, loginAs, runToken } from '../lab-03/helpers';
import { actionsSection, createActionForm, openStaffTicket, prepareTicket } from './helpers';

/**
 * E2E-L4-11 (docs/lab-04/tests.md §2.8; AC-25, FR-20, FR-21): duplicate-submit protection and data
 * retention through the real UI.
 * - Double-clicking a status change, Save Action, or Post Comment makes exactly one change.
 * - An injected 500 on Add Action and on Create Ticket keeps every entered value, and the same
 *   form then saves once the server recovers.
 */

const SERVER_ERROR = { status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'INTERNAL_ERROR' }) };

/** Fails only POSTs to exactly `pathname`, and only while `active()` is true. */
function failPost(pathname: RegExp, active: () => boolean) {
  return (route: Route) => {
    const req = route.request();
    if (req.method() === 'POST' && pathname.test(new URL(req.url()).pathname) && active()) return route.fulfill(SERVER_ERROR);
    return route.continue();
  };
}

async function history(page: Page, ticketId: number) {
  return (await (await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/status-history`)).json()).data as Array<{ toStatus: string }>;
}

test.describe.serial('E2E-L4-11: duplicate submission and data retention', () => {
  const token = runToken('E2E-L4-11');
  let ticketId: number;

  test('setup: a Ticket owned by the primary staff member', async ({ page }) => {
    ticketId = await prepareTicket(page, token);
  });

  test('double-clicking Save Status makes one status change', async ({ page }) => {
    await loginAs(page, 'staff');
    await openStaffTicket(page, ticketId);
    await page.locator('#status-select').selectOption('IN_PROGRESS');
    await page.getByRole('button', { name: 'Save Status' }).dblclick();
    await expect(page.getByText('Status changed to In Progress')).toBeVisible();
    await expect(page.getByText(/updated this ticket while you were viewing it/i)).toHaveCount(0);
    expect((await history(page, ticketId)).filter((h) => h.toStatus === 'IN_PROGRESS')).toHaveLength(1);
  });

  test('double-clicking Save Action creates one action', async ({ page }) => {
    const description = `${token} Double-click check on the loaner laptop.`;
    await loginAs(page, 'staff');
    await openStaffTicket(page, ticketId);
    await actionsSection(page).getByRole('button', { name: 'Add Action' }).click();
    const form = createActionForm(page);
    await form.getByLabel(/^Description/).fill(description);
    await form.getByRole('button', { name: 'Save Action' }).dblclick();
    await expect(actionsSection(page).getByRole('table').getByText(description)).toBeVisible();
    const actions = (await (await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/actions`)).json()).data as Array<{ description: string }>;
    expect(actions.filter((a) => a.description === description)).toHaveLength(1);
  });

  test('double-clicking Post Comment posts one comment', async ({ page }) => {
    const content = `${token} We are checking the battery today.`;
    await loginAs(page, 'staff');
    await openStaffTicket(page, ticketId);
    await page.locator('#new-comment').fill(content);
    await page.getByRole('button', { name: 'Post Comment' }).dblclick();
    await expect(page.getByText(content)).toBeVisible();
    const comments = (await (await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/comments`)).json()) as Array<{ content: string }>;
    expect(comments.filter((c) => c.content === content)).toHaveLength(1);
  });

  test('a 500 on Save Action keeps every entered value; the same form then saves once', async ({ page }) => {
    const description = `${token} Re-seated the battery connector.`;
    const result = 'Battery now charges normally.';
    let failing = true;
    await page.route('**/api/tickets/*/actions', failPost(/^\/api\/tickets\/\d+\/actions$/, () => failing));
    await loginAs(page, 'staff');
    await openStaffTicket(page, ticketId);
    await actionsSection(page).getByRole('button', { name: 'Add Action' }).click();
    const form = createActionForm(page);
    await form.getByLabel(/^Description/).fill(description);
    await form.getByRole('radiogroup', { name: 'Status' }).getByText('Completed', { exact: true }).click();
    await form.getByLabel(/^Result/).fill(result);
    await form.getByRole('button', { name: 'Save Action' }).click();

    await expect(form.getByRole('alert').filter({ hasText: 'Something went wrong. Please try again.' })).toBeVisible();
    await expect(form.getByLabel(/^Description/)).toHaveValue(description);
    await expect(form.getByLabel(/^Result/)).toHaveValue(result);
    await expect(form.getByRole('radio', { name: 'Completed' })).toBeChecked();

    failing = false;
    await form.getByRole('button', { name: 'Save Action' }).click();
    await expect(actionsSection(page).getByRole('table').getByText(description)).toBeVisible();
    const actions = (await (await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/actions`)).json()).data as Array<{ description: string }>;
    expect(actions.filter((a) => a.description === description)).toHaveLength(1);
  });

  test('a 500 on Create Ticket keeps every entered value', async ({ page }) => {
    const summary = `${token} Projector flickers in Room 204`;
    const description = 'The projector in Room 204 flickers every few seconds during lectures.';
    let failing = true;
    await page.route('**/api/tickets', failPost(/^\/api\/tickets$/, () => failing));
    await loginAs(page, 'requester');
    await page.goto('/tickets/new');
    await page.locator('#category-select').selectOption({ label: 'Hardware' });
    await page.locator('#related-system-select').selectOption({ label: 'Corporate Laptop' });
    await page.locator('#priority-select').selectOption('HIGH');
    await page.locator('#summary-input').fill(summary);
    await page.locator('#description-textarea').fill(description);
    await page.getByRole('button', { name: 'Submit Ticket' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /Unable to create ticket/ })).toBeVisible();
    await expect(page.locator('#summary-input')).toHaveValue(summary);
    await expect(page.locator('#description-textarea')).toHaveValue(description);
    await expect(page.locator('#priority-select')).toHaveValue('HIGH');
    await expect(page.locator('#category-select option:checked')).toHaveText('Hardware');

    failing = false;
    await page.getByRole('button', { name: 'Submit Ticket' }).click();
    await expect(page.getByTestId('ticket-number-display')).toBeVisible();
  });
});
