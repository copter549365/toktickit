import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { activeElementHasVisibleFocusRing, loginAs, runToken, signOut } from '../lab-03/helpers';
import { actionsSection, createActionViaApi, openStaffTicket, prepareTicket } from './helpers';

/**
 * A11Y-L4-01 (docs/lab-04/tests.md §2.7; AC-26, ui-spec §10): a keyboard-only journey.
 * - Tab reaches every dashboard card, each with a visible focus ring, and Enter follows it.
 * - Tab reaches the Actions Taken table buttons; the drawer and the status modal trap focus,
 *   close with Esc, and return focus to the control that opened them.
 * - Following `#actions-taken` focuses the section heading.
 */

/** Presses Tab until `target` has focus, then checks its focus ring. */
async function tabTo(page: Page, target: Locator, maxTabs = 120) {
  for (let i = 0; i < maxTabs; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
  expect(await activeElementHasVisibleFocusRing(page), 'visible focus ring').toBe(true);
}

/** Tabs `count` times and asserts focus never leaves `dialog` (the focus trap). */
async function expectFocusTrapped(page: Page, dialog: Locator, count = 25) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `focus left the dialog after ${i + 1} tabs`).toBe(true);
  }
}

test.describe.serial('A11Y-L4-01: keyboard journey through the Lab 4 screens', () => {
  const token = runToken('A11Y-L4');
  let ticketId: number;

  test('setup: a Ticket with an open action', async ({ page }) => {
    ticketId = await prepareTicket(page, token);
    await createActionViaApi(page, ticketId, `${token} Keyboard check action.`);
    await signOut(page);
  });

  test('every staff dashboard card is reachable by Tab with a visible focus ring, and Enter follows it', async ({ page }) => {
    await loginAs(page, 'staff');
    const cards = page.locator('.zg-metric-grid a.zg-metric-card');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBe(13);
    await page.locator('body').focus();
    for (let i = 0; i < count; i++) await tabTo(page, cards.nth(i));

    // Enter on a focused card opens its filtered list.
    await tabTo(page, page.getByRole('link', { name: /^Unassigned: \d+\. View tickets$/ }));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/staff\/tickets\?ticketOwnerId=unassigned&statusGroup=active$/);
  });

  test('every Requester dashboard card is reachable by Tab with a visible focus ring', async ({ page }) => {
    await loginAs(page, 'requester');
    const cards = page.getByRole('list', { name: 'Ticket summary' }).getByRole('link');
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) await tabTo(page, cards.nth(i));
  });

  test('the action drawer traps focus, closes with Esc, and returns focus to its View button', async ({ page }) => {
    await loginAs(page, 'staff');
    await openStaffTicket(page, ticketId);
    const viewButton = actionsSection(page).getByRole('table').getByRole('button', { name: /^View action #/ }).first();
    await tabTo(page, viewButton);
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: /^Action #\d+$/ });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expectFocusTrapped(page, drawer);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(viewButton).toBeFocused();
  });

  test('the status modal traps focus, closes with Esc, and returns focus to Save Status', async ({ page }) => {
    await loginAs(page, 'staff');
    await openStaffTicket(page, ticketId);
    await page.locator('#status-select').selectOption('CANCELLED');
    const save = page.getByRole('button', { name: 'Save Status' });
    await tabTo(page, save);
    await page.keyboard.press('Enter');
    const modal = page.getByRole('dialog', { name: 'Confirm transition to Cancelled' });
    await expect(modal).toBeVisible();
    await expectFocusTrapped(page, modal);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(save).toBeFocused();
  });

  test('following #actions-taken focuses the section heading', async ({ page }) => {
    await loginAs(page, 'staff');
    await page.goto(`/staff/tickets/${ticketId}#actions-taken`);
    await expect(actionsSection(page).getByRole('heading', { name: /^Actions Taken \(\d+\)$/ })).toBeFocused();
  });
});
