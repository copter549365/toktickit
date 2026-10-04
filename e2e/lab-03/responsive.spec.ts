import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERS } from './fixtures';
import {
  VIEWPORTS,
  activeElementHasVisibleFocusRing,
  apiAsPage,
  assertNoHorizontalScroll,
  expandShellNav,
  fillLogin,
  loginAs,
  screenshotPath,
  signOut,
} from './helpers';

/**
 * RESP-01..RESP-03 + STYLE-02 (docs/lab-03/tests.md), ui-spec.md §8 Visual Inspection Checklist:
 * every major Lab 3 screen at Desktop (1280px), Tablet (768px), and Mobile (375px) is checked
 * for horizontal overflow, clipped badges, role-appropriate navigation, editable vs read-only
 * field styling, and visible keyboard focus, and a screenshot is saved as evidence under
 * artifacts/lab-03/screenshots/.
 */

/** No badge or button label is cut off inside its own box (ui-spec.md §8 "Clipping & Overlap"). */
async function assertNoClippedLabels(page: Page) {
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.zg-badge, .btn'))
      .filter((el) => el.offsetParent !== null)
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent?.trim() ?? ''),
  );
  expect(clipped, `clipped labels: ${clipped.join(', ')}`).toEqual([]);
}

async function checkLayout(page: Page) {
  await assertNoHorizontalScroll(page);
  await assertNoClippedLabels(page);
}

/** Tabs to the first element matching `selector` and asserts it shows a focus indicator. */
async function assertKeyboardFocusVisible(page: Page, selector: string) {
  const target = page.locator(selector).first();
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
  expect(await activeElementHasVisibleFocusRing(page)).toBe(true);
}

let seededTicketId: string;

test.beforeAll(async ({ browser }) => {
  // Resolve the id of a seeded, operational Ticket (with comments and notes) for detail screens.
  const page = await browser.newPage();
  await loginAs(page, 'staff');
  const res = await apiAsPage(page, 'GET', '/api/staff/tickets?search=TKT-2026-000001');
  const body = await res.json();
  seededTicketId = String(body.data[0].id);
  await page.close();
});

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`RESP at ${viewportName} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    test('authentication: login and mandatory password change', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
      await checkLayout(page);
      await assertKeyboardFocusVisible(page, '#login-email');
      await page.screenshot({ path: screenshotPath('authentication', `${viewportName}-login`), fullPage: true });

      await fillLogin(page, E2E_USERS.passwordGate.email, E2E_PASSWORD);
      await expect(page).toHaveURL(/\/change-password$/);
      await page.locator('#new-password').fill('Abc');
      await checkLayout(page);
      await page.screenshot({ path: screenshotPath('authentication', `${viewportName}-change-password`), fullPage: true });
    });

    test('staff queue: table on desktop/tablet, cards on mobile', async ({ page }) => {
      await loginAs(page, 'staff');
      await expect(page.getByRole('heading', { name: 'IT Staff Ticket Queue' })).toBeVisible();

      if (viewportName === 'mobile') {
        await expect(page.locator('[data-testid^="queue-card-"]').first()).toBeVisible();
        await expect(page.getByTestId('staff-queue-table')).toBeHidden();
        // Role navigation is collapsed behind the toggler, and reveals only the IT Staff link.
        await expandShellNav(page);
      } else {
        await expect(page.locator('[data-testid^="queue-row-"]').first()).toBeVisible();
      }
      const header = page.locator('header');
      await expect(header.getByRole('link', { name: 'Ticket Queue' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'User Management' })).toHaveCount(0);
      await expect(header.getByRole('link', { name: 'My Tickets' })).toHaveCount(0);

      await checkLayout(page);
      await page.screenshot({ path: screenshotPath('staff-queue', `${viewportName}-queue`), fullPage: true });
    });

    test('staff ticket detail: read-only vs editable fields, comments vs internal notes', async ({ page }) => {
      await loginAs(page, 'staff');
      await page.goto(`/staff/tickets/${seededTicketId}`);
      await expect(page.getByRole('heading', { name: 'TKT-2026-000001' })).toBeVisible();

      // Editable vs read-only styling (ui-spec.md §4.1): warm ivory vs white.
      const readonlyBg = await page.locator('#detail-summary').evaluate((el) => getComputedStyle(el).backgroundColor);
      const editableBg = await page.locator('#owner-select').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(readonlyBg).toBe('rgb(241, 240, 232)');
      expect(editableBg).toBe('rgb(255, 255, 255)');

      // Internal Notes are visually distinct from Public Comments.
      // Internal Notes: amber #B36B00 border on a pale amber fill (ui-spec.md §8 "Comments vs Notes").
      const panelStyle = (testId: string) =>
        page.getByTestId(testId).evaluate((el) => {
          const s = getComputedStyle(el);
          return { borderColor: s.borderTopColor, borderWidth: s.borderTopWidth, background: s.backgroundColor };
        });
      const notesStyle = await panelStyle('internal-notes-section');
      const commentsStyle = await panelStyle('public-comments-section');
      expect(notesStyle.borderColor).toBe('rgb(179, 107, 0)');
      expect(notesStyle.borderWidth).toBe('1px');
      expect(notesStyle.background).not.toBe(commentsStyle.background);

      await checkLayout(page);
      await assertKeyboardFocusVisible(page, '#owner-select');
      await page.screenshot({ path: screenshotPath('staff-ticket-detail', `${viewportName}-ticket-detail`), fullPage: true });
    });

    test('user management: list, create dialog, edit dialog', async ({ page }) => {
      await loginAs(page, 'admin');
      if (viewportName === 'mobile') {
        // Stacked cards keep Role, Status, and Edit on screen instead of in a sideways scroll.
        const firstCard = page.locator('[data-testid^="user-card-"]').first();
        await expect(firstCard).toBeVisible();
        await expect(firstCard.getByRole('button', { name: 'Edit User' })).toBeInViewport();
        await expect(page.getByTestId('user-management-table')).toBeHidden();
      } else {
        await expect(page.getByTestId('user-management-table')).toBeVisible();
      }
      await checkLayout(page);
      await page.screenshot({ path: screenshotPath('user-management', `${viewportName}-user-list`), fullPage: true });

      await page.getByRole('button', { name: 'Create New User' }).click();
      const create = page.getByRole('dialog', { name: 'Create New User' });
      await expect(create).toBeVisible();
      await checkLayout(page);
      await page.screenshot({ path: screenshotPath('user-management', `${viewportName}-create-user`), fullPage: true });
      await create.getByRole('button', { name: 'Cancel' }).click();

      await page.locator('#user-search-input').fill(E2E_USERS.admin.email);
      await expect(page.locator('[data-testid^="user-row-"]')).toHaveCount(1);
      await page.getByRole('button', { name: 'Edit User' }).click();
      const edit = page.getByRole('dialog', { name: 'Edit User' });
      await expect(edit.getByText('You cannot deactivate your own account.')).toBeVisible();
      await checkLayout(page);
      await page.screenshot({ path: screenshotPath('user-management', `${viewportName}-edit-user`), fullPage: true });
    });

    test('requester regression: My Tickets home and sign-out reachable', async ({ page }) => {
      await loginAs(page, 'requester');
      await expect(page).toHaveURL(/\/tickets$/);
      await checkLayout(page);
      await page.screenshot({ path: screenshotPath('authentication', `${viewportName}-requester-home`), fullPage: true });

      // Logout is reachable at every width (behind the toggler on mobile).
      await signOut(page);
      await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });
  });
}
