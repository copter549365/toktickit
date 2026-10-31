import { randomUUID } from 'crypto';
import { request as playwrightRequest } from '@playwright/test';
import { test, expect, lab4Screenshot } from './fixtures';
import { E2E_PASSWORD, E2E_USERS } from '../lab-03/fixtures';
import { API_URL, VIEWPORTS, apiAsPage, assertNoHorizontalScroll, loginAs, runToken, signOut } from '../lab-03/helpers';
import {
  actionRow as rowFor,
  actionsSection as section,
  createActionForm as createForm,
  createActionViaApi,
  openStaffTicket,
  pickStatus,
  prepareTicket,
} from './helpers';

/**
 * E2E-L4-01..03 (docs/lab-04/tests.md §6): Actions Taken through the real UI and API.
 * - L4-01: two staff members perform work on one Ticket; the Requester sees it read-only.
 * - L4-02: inline validation and server-side rejection of an inactive assignee.
 * - L4-03: cancel-and-lock, and a concurrent edit that ends in the conflict banner.
 */

test.describe.serial('E2E-L4-01: multiple performers on one Ticket (AC-01, AC-02, AC-05, AC-08)', () => {
  const token = runToken('E2E-L4-01');
  const first = `${token} Checked the battery health report in BIOS.`;
  const second = `${token} Replaced the battery with a new OEM unit.`;
  let ticketId = 0;

  test('the owner adds an action assigned to a second staff member', async ({ page }) => {
    ticketId = await prepareTicket(page, token);
    await openStaffTicket(page, ticketId);
    await expect(section(page).getByText('No actions recorded yet.')).toBeVisible();
    await expect(section(page).getByText('Visible to Requester')).toBeVisible();

    await section(page).getByRole('button', { name: 'Add Action' }).click();
    const form = createForm(page);
    await expect(form.getByLabel(/^Description/)).toBeFocused();
    await form.getByLabel(/^Description/).fill(first);
    await form.getByLabel('Assignee').selectOption({ label: E2E_USERS.staffSecondary.name });
    await form.getByRole('button', { name: 'Save Action' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Action added' })).toBeVisible();
    const row = await rowFor(page, first);
    await expect(row).toBeFocused();
    await expect(row).toContainText(E2E_USERS.staffSecondary.name);
    await expect(row).toContainText('Planned');
    await expect(section(page).getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible();
    await signOut(page);
  });

  test('the assignee starts and completes it; Performed by is the assignee, the owner is unchanged', async ({ page }) => {
    await loginAs(page, 'staffSecondary');
    await openStaffTicket(page, ticketId);

    await (await rowFor(page, first)).getByRole('button', { name: /^Edit action/ }).click();
    const drawer = page.getByRole('dialog', { name: /^Action #\d+$/ });
    await drawer.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Action started' })).toBeVisible();
    await expect(drawer.getByText('In Progress')).toBeVisible();

    await drawer.getByRole('button', { name: 'Edit', exact: true }).click();
    await drawer.getByLabel(/^Result/).fill('Battery wear level is 41%; replacement needed.');
    await drawer.getByRole('button', { name: 'Mark Completed' }).click();
    await drawer.getByRole('button', { name: 'Confirm Completion' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Action completed' })).toBeVisible();
    await expect(drawer.getByText('Completed actions are read-only')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    const row = await rowFor(page, first);
    await expect(row).toContainText('Completed');
    await expect(row.locator('td').nth(4)).toHaveText(E2E_USERS.staffSecondary.name); // Performed by
    await expect(row.getByRole('button', { name: /^Edit action/ })).toHaveCount(0);
    const ticket = await (await apiAsPage(page, 'GET', `/api/staff/tickets/${ticketId}`)).json();
    expect(ticket.owner.name).toBe(E2E_USERS.staff.name); // BR-02: completing work never moves the owner
    await signOut(page);
  });

  test('the owner adds a second, already completed action', async ({ page }) => {
    await loginAs(page, 'staff');
    await openStaffTicket(page, ticketId);
    await section(page).getByRole('button', { name: 'Add Action' }).click();
    const form = createForm(page);
    await form.getByLabel(/^Description/).fill(second);
    await pickStatus(form, 'Completed');
    await form.getByLabel(/^Result/).fill('Battery now lasts more than 6 hours in testing.');
    await form.getByLabel('Follow-Up Required?').check();
    await expect(form.getByLabel(/^Follow-up Note/)).toBeFocused();
    await form.getByLabel(/^Follow-up Note/).fill('Check battery health again in two weeks.');
    await form.getByRole('button', { name: 'Save Action' }).click();

    const row = await rowFor(page, second);
    await expect(row.locator('td').nth(4)).toHaveText(E2E_USERS.staff.name);
    await expect(row).toContainText('Follow-up required');
    await expect(section(page).getByRole('heading', { name: 'Actions Taken (2)' })).toBeVisible();
    await page.screenshot({ path: lab4Screenshot('actions-taken', 'multiple-performers-one-ticket'), fullPage: true });

    for (const [name, size] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(size);
      await section(page).scrollIntoViewIfNeeded();
      await assertNoHorizontalScroll(page);
      await section(page).screenshot({ path: lab4Screenshot('actions-taken', `${name}-actions-list`) });
    }
    await page.setViewportSize(VIEWPORTS.desktop);

    await (await rowFor(page, second)).getByRole('button', { name: /^View action/ }).click();
    await page.getByRole('dialog', { name: /^Action #\d+$/ }).waitFor();
    await page.screenshot({ path: lab4Screenshot('actions-taken', 'view-drawer') });
    await page.keyboard.press('Escape');
    await signOut(page);
  });

  test('the Requester sees both actions read-only with the correct Performed by', async ({ page }) => {
    await loginAs(page, 'requester');
    await page.goto(`/tickets/${ticketId}`);
    await expect(section(page).getByRole('heading', { name: 'Actions Taken (2)' })).toBeVisible();
    await expect((await rowFor(page, first)).locator('td').nth(4)).toHaveText(E2E_USERS.staffSecondary.name);
    await expect((await rowFor(page, second)).locator('td').nth(4)).toHaveText(E2E_USERS.staff.name);
    await expect(section(page).getByRole('button', { name: /Add Action|^Edit/ })).toHaveCount(0);
    await expect(section(page).getByRole('form')).toHaveCount(0);
    await page.screenshot({ path: lab4Screenshot('actions-taken', 'requester-readonly-actions'), fullPage: true });

    // The backend refuses the write too, whatever the UI shows (BR-10).
    const res = await apiAsPage(page, 'POST', `/api/tickets/${ticketId}/actions`, {
      clientRequestId: randomUUID(),
      description: 'Requester trying to add an action.',
    });
    expect(res.status()).toBe(403);
  });
});

test.describe.serial('E2E-L4-02: validation and inactive-assignee rejection (AC-03, AC-04)', () => {
  const token = runToken('E2E-L4-02');
  let inactiveStaffId = 0;

  test.beforeAll(async () => {
    const admin = await playwrightRequest.newContext({ baseURL: API_URL });
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    const login = await admin.post('/api/auth/login', {
      headers,
      data: { email: E2E_USERS.admin.email, password: E2E_PASSWORD },
    });
    expect(login.ok()).toBe(true);
    const users = await admin.get(`/api/admin/users?search=${encodeURIComponent(E2E_USERS.staffInactive.email)}`);
    inactiveStaffId = (await users.json()).find((u: { email: string }) => u.email === E2E_USERS.staffInactive.email).id;
    await admin.dispose();
  });

  test('inline errors appear under their fields and nothing is sent', async ({ page }) => {
    const ticketId = await prepareTicket(page, token);
    await openStaffTicket(page, ticketId);
    await section(page).getByRole('button', { name: 'Add Action' }).click();
    const form = createForm(page);

    let posts = 0;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith(`/api/tickets/${ticketId}/actions`)) posts += 1;
    });

    await pickStatus(form, 'Completed');
    await form.getByLabel('Follow-Up Required?').check();
    await form.getByLabel(/^Description/).fill('abc');
    await form.getByRole('button', { name: 'Save Action' }).click();
    await expect(form.getByRole('alert').filter({ hasText: 'Description must be 5-2000 characters.' })).toBeVisible();
    await expect(form.getByRole('alert').filter({ hasText: 'Result must be 5-2000 characters.' })).toBeVisible();
    await expect(form.getByRole('alert').filter({ hasText: 'Follow-up note must be 5-1000 characters.' })).toBeVisible();
    await form.screenshot({ path: lab4Screenshot('actions-taken', 'create-form-validation') });
    expect(posts).toBe(0);

    // An inactive assignee forced through the request is rejected by the server (BR-06).
    await pickStatus(form, 'Planned');
    await form.getByLabel('Follow-Up Required?').uncheck();
    await form.getByLabel(/^Description/).fill(`${token} Ran the vendor battery diagnostic.`);
    await page.route(`${API_URL}/api/tickets/${ticketId}/actions`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = { ...route.request().postDataJSON(), assigneeId: inactiveStaffId };
      return route.continue({ postData: JSON.stringify(body) });
    });
    await form.getByRole('button', { name: 'Save Action' }).click();

    const assigneeError = form.getByRole('alert').filter({ hasText: 'Choose an active IT Staff member or Administrator.' });
    await expect(assigneeError).toBeVisible();
    await expect(form.getByLabel('Assignee')).toHaveAttribute('aria-describedby', 'create-action-assignee-error');
    await expect(form.getByLabel(/^Description/)).toHaveValue(`${token} Ran the vendor battery diagnostic.`);
    await form.screenshot({ path: lab4Screenshot('actions-taken', 'inactive-assignee-rejected') });
    await page.unroute(`${API_URL}/api/tickets/${ticketId}/actions`);

    const list = await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/actions`);
    expect((await list.json()).data).toHaveLength(0);
  });
});

test.describe.serial('E2E-L4-03: cancel action and concurrent edit (AC-06, AC-07)', () => {
  const token = runToken('E2E-L4-03');
  let ticketId = 0;

  test('the Cancel modal sets CANCELLED and locks the row', async ({ page }) => {
    ticketId = await prepareTicket(page, token);
    const description = `${token} Ordered a replacement charger.`;
    await createActionViaApi(page, ticketId, description);
    await openStaffTicket(page, ticketId);

    await (await rowFor(page, description)).getByRole('button', { name: /^Edit action/ }).click();
    const drawer = page.getByRole('dialog', { name: /^Action #\d+$/ });
    await drawer.getByRole('button', { name: 'Cancel Action' }).click();
    const modal = page.getByRole('dialog', { name: 'Cancel Action' });
    await expect(modal.getByLabel(/^Reason for cancelling/)).toBeFocused();
    await modal.getByRole('button', { name: 'Confirm Cancel' }).click();
    await expect(modal.getByRole('alert')).toHaveText('Cancel reason must be 5-500 characters.');
    await modal.getByLabel(/^Reason for cancelling/).fill('The original charger works after all.');
    await page.screenshot({ path: lab4Screenshot('actions-taken', 'cancel-action-modal') });
    await modal.getByRole('button', { name: 'Confirm Cancel' }).click();

    await expect(modal).toHaveCount(0);
    await expect(drawer.getByText('Cancelled actions are read-only')).toBeVisible();
    await expect(drawer.getByText('The original charger works after all.')).toBeVisible();
    await page.keyboard.press('Escape');
    const row = await rowFor(page, description);
    await expect(row).toContainText('Cancelled');
    await expect(row.getByRole('button', { name: /^Edit action/ })).toHaveCount(0);

    // Locked on the server as well (BR-07).
    const actions = (await (await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/actions`)).json()).data;
    const locked = await apiAsPage(page, 'PATCH', `/api/tickets/${ticketId}/actions/${actions[0].id}`, {
      expectedVersion: actions[0].version,
      description: 'Editing a cancelled action.',
    });
    expect(locked.status()).toBe(409);
    expect((await locked.json()).error).toBe('ACTION_LOCKED');
  });

  test('two staff edit the same action: the second sees the conflict banner, reloads, and saves', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await loginAs(pageA, 'staff');
      const original = `${token} Booked a loaner laptop.`;
      await createActionViaApi(pageA, ticketId, original);
      await loginAs(pageB, 'staffSecondary');

      for (const p of [pageA, pageB]) {
        await openStaffTicket(p, ticketId);
        await (await rowFor(p, original)).getByRole('button', { name: /^Edit action/ }).click();
      }
      const drawerA = pageA.getByRole('dialog', { name: /^Action #\d+$/ });
      const drawerB = pageB.getByRole('dialog', { name: /^Action #\d+$/ });

      const textA = `${token} Booked a loaner laptop until Friday.`;
      await drawerA.getByLabel(/^Description/).fill(textA);
      await pageA.screenshot({ path: lab4Screenshot('actions-taken', 'edit-drawer') });
      await drawerA.getByRole('button', { name: 'Save Changes' }).click();
      await expect(pageA.getByRole('status').filter({ hasText: 'Action updated' })).toBeVisible();

      const textB = `${token} Booked a loaner laptop; requester collects it at 2pm.`;
      await drawerB.getByLabel(/^Description/).fill(textB);
      await drawerB.getByRole('button', { name: 'Save Changes' }).click();
      const banner = drawerB.getByText('Someone else updated this action. Your changes are kept below.');
      await expect(banner).toBeVisible();
      await expect(drawerB.getByLabel(/^Description/)).toHaveValue(textB);
      await banner.scrollIntoViewIfNeeded();
      await pageB.screenshot({ path: lab4Screenshot('actions-taken', 'conflict-banner') });

      await drawerB.getByRole('button', { name: 'Reload latest' }).click();
      await expect(drawerB.getByRole('region', { name: 'Latest saved version' })).toContainText(textA);
      await expect(drawerB.getByLabel(/^Description/)).toHaveValue(textB);
      await drawerB.getByRole('button', { name: 'Save Changes' }).click();
      await expect(pageB.getByRole('status').filter({ hasText: 'Action updated' })).toBeVisible();

      const actions = (await (await apiAsPage(pageB, 'GET', `/api/tickets/${ticketId}/actions`)).json()).data;
      const saved = actions.find((a: { description: string }) => a.description === textB);
      expect(saved.version).toBe(3);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
