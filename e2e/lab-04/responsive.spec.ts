import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { VIEWPORTS, apiAsPage, assertNoHorizontalScroll, loginAs, runToken, signOut, type ViewportName } from '../lab-03/helpers';
import { actionsSection, createActionForm, createActionViaApi, openStaffTicket, prepareTicket } from './helpers';

/**
 * STYLE-L4-01, STYLE-L4-02, RESP-L4-01..03 (docs/lab-04/tests.md §2.7; AC-26, ui-spec §9, §11):
 * every Lab 4 screen, drawer, and modal at 1280, 768, and 375 px has no horizontal overflow and no
 * clipped badge, button, or card text; card grids reflow as ui-spec §9 says; metric cards and
 * Action badges follow the Zen Green rules.
 */

const VIEWPORT_ENTRIES = Object.entries(VIEWPORTS) as [ViewportName, (typeof VIEWPORTS)[ViewportName]][];

/** Badges, buttons, and metric card text must not be cut off (scrollWidth > clientWidth). */
async function assertNothingClipped(page: Page, where: string) {
  const clipped = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('.zg-badge, .btn, .zg-metric-card__label, .zg-metric-card__value, .zg-followup-pill, .zg-visibility-tag'),
    )
      .filter((el) => el.offsetParent !== null)
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent?.trim() ?? ''),
  );
  expect(clipped, `clipped on ${where}: ${clipped.join(', ')}`).toEqual([]);
}

async function checkLayout(page: Page, where: string) {
  await assertNoHorizontalScroll(page);
  await assertNothingClipped(page, where);
}

async function gridColumns(page: Page, listName: string): Promise<number> {
  return page
    .getByRole('list', { name: listName })
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
}

test.describe.serial('Lab 4 screens at every viewport (RESP-L4-01..03, STYLE-L4-01/02)', () => {
  const token = runToken('RESP-L4');
  let ticketId: number;

  test('setup: a Ticket with one planned and one completed action', async ({ page }) => {
    ticketId = await prepareTicket(page, token);
    await createActionViaApi(page, ticketId, `${token} Planned check of the dock.`);
    await createActionViaApi(page, ticketId, `${token} Replaced the battery.`, { status: 'COMPLETED', result: 'Battery holds a full charge.' });
    await signOut(page);
  });

  for (const [name, viewport] of VIEWPORT_ENTRIES) {
    test(`staff screens at ${name}: dashboard grids, Ticket detail, form, drawer, and modal`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, 'staff');
      await expect(page.getByRole('list', { name: 'Ticket status' })).toBeVisible();
      await checkLayout(page, `${name} staff dashboard`);
      // ui-spec §9: status cards 6 / 3 / 2 and workload cards 4 / 2 / 2.
      expect(await gridColumns(page, 'Ticket status')).toBe({ desktop: 6, tablet: 3, mobile: 2 }[name]);
      expect(await gridColumns(page, 'Workload')).toBe({ desktop: 4, tablet: 2, mobile: 2 }[name]);

      await openStaffTicket(page, ticketId);
      await checkLayout(page, `${name} staff Ticket detail`);
      if (name === 'mobile') {
        // Actions Taken become cards on mobile (ui-spec §9).
        await expect(actionsSection(page).getByRole('table')).toBeHidden();
        await expect(actionsSection(page).getByRole('listitem').first()).toBeVisible();
      } else {
        await expect(actionsSection(page).getByRole('table')).toBeVisible();
      }

      await actionsSection(page).getByRole('button', { name: 'Add Action' }).click();
      await expect(createActionForm(page)).toBeVisible();
      await checkLayout(page, `${name} Add Action form`);
      await createActionForm(page).getByRole('button', { name: 'Cancel' }).click();

      await actionsSection(page).getByRole('button', { name: /^View action #/ }).filter({ visible: true }).first().click();
      const drawer = page.getByRole('dialog', { name: /^Action #\d+$/ });
      await expect(drawer).toBeVisible();
      await checkLayout(page, `${name} action drawer`);
      const drawerWidth = await drawer.evaluate((el) => el.getBoundingClientRect().width);
      // ui-spec §9: 480 px drawer, 60 % on tablet, full-screen sheet on mobile.
      const expected = { desktop: 480, tablet: viewport.width * 0.6, mobile: viewport.width }[name];
      expect(Math.abs(drawerWidth - expected), `${name} drawer width ${drawerWidth}`).toBeLessThan(2);
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);

      await page.locator('#status-select').selectOption('CANCELLED');
      await page.getByRole('button', { name: 'Save Status' }).click();
      const modal = page.getByRole('dialog', { name: 'Confirm transition to Cancelled' });
      await expect(modal).toBeVisible();
      await checkLayout(page, `${name} status modal`);
      await modal.getByRole('button', { name: 'Never Mind' }).click();
      await expect(modal).toHaveCount(0);
    });

    test(`Requester and Administrator screens at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, 'requester');
      await expect(page.getByRole('list', { name: 'Ticket summary' })).toBeVisible();
      await checkLayout(page, `${name} Requester dashboard`);
      // ui-spec §9: Requester cards 4 / 2 / 2.
      expect(await gridColumns(page, 'Ticket summary')).toBe({ desktop: 4, tablet: 2, mobile: 2 }[name]);
      await page.goto(`/tickets/${ticketId}`);
      await expect(actionsSection(page)).toBeVisible();
      await checkLayout(page, `${name} Requester Ticket detail`);
      await signOut(page);

      await loginAs(page, 'admin');
      await expect(page.getByRole('list', { name: 'User Accounts' })).toBeVisible();
      await checkLayout(page, `${name} Administrator dashboard`);
      await page.goto('/admin/users?isActive=true');
      await expect(page.getByText(/^\d+ users?$/)).toBeVisible();
      await checkLayout(page, `${name} User Management`);
    });
  }

  test('STYLE-L4-01: metric cards show label and value, 0 for zero, and the Zen Green border', async ({ page }) => {
    await loginAs(page, 'staffEmpty');
    const card = page.getByRole('link', { name: 'My Assigned: 0. View tickets' });
    await expect(card).toBeVisible();
    await expect(card.locator('.zg-metric-card__value')).toHaveText('0');
    await expect(card.locator('.zg-metric-card__label')).toHaveText('My Assigned');
    await expect(card).toHaveCSS('border-top-color', 'rgb(203, 213, 209)'); // --color-field-editable-border
    await expect(card).toHaveCSS('border-radius', '8px');
  });

  test('STYLE-L4-02: action badges pair text with an icon; Performed by is ivory; the shared-content tag is shown', async ({ page }) => {
    await loginAs(page, 'staff');
    await openStaffTicket(page, ticketId);
    await expect(actionsSection(page).getByText('Visible to Requester')).toBeVisible();

    const badges = actionsSection(page).getByRole('table').locator('.zg-badge');
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      const badge = badges.nth(i);
      await expect(badge.locator('[aria-hidden="true"]')).toHaveCount(1); // the icon glyph
      expect((await badge.locator('.zg-badge__label').textContent())?.trim()).toMatch(/^(Planned|In Progress|Completed|Cancelled)$/);
    }

    await actionsSection(page).getByRole('button', { name: /^View action #/ }).filter({ visible: true }).first().click();
    const drawer = page.getByRole('dialog', { name: /^Action #\d+$/ });
    await expect(drawer.locator('.field-readonly').first()).toHaveCSS('background-color', 'rgb(241, 240, 232)');
    await page.keyboard.press('Escape');

    // Both fixture actions were checked above.
    const res = await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/actions`);
    expect((await res.json()).meta.totalCount).toBe(2);
  });
});
