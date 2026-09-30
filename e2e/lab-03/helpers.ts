import path from 'path';
import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERS, type E2EUserKey } from './fixtures';

/** ui-spec.md §6 / §8: Desktop (1280px), Tablet (768px), Mobile (375px). */
export const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

export const API_URL = 'http://localhost:3000';

export const SCREENSHOT_ROOT = path.resolve(__dirname, '../../artifacts/lab-03/screenshots');

export type ScreenshotGroup = 'authentication' | 'staff-queue' | 'staff-ticket-detail' | 'user-management';

export function screenshotPath(group: ScreenshotGroup, name: string): string {
  return path.join(SCREENSHOT_ROOT, group, `${name}.png`);
}

/** A per-run marker so each journey can find exactly the records it created in the shared DB. */
export function runToken(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

export async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

/** Logs a fixture account in through the real Login screen and waits for its role home. */
export async function loginAs(page: Page, key: E2EUserKey, password = E2E_PASSWORD): Promise<void> {
  await fillLogin(page, E2E_USERS[key].email, password);
  await expect(page.getByTestId('auth-user-name')).toHaveText(E2E_USERS[key].name);
}

/** Below the md breakpoint the shell nav collapses behind a toggler (ui-spec.md §5.3). */
export async function expandShellNav(page: Page): Promise<void> {
  const toggler = page.locator('.navbar-toggler');
  if (await toggler.isVisible()) {
    const expanded = await toggler.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await toggler.click();
    }
  }
}

export async function signOut(page: Page): Promise<void> {
  await expandShellNav(page);
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await page.waitForURL('**/login');
}

/**
 * Direct API call that reuses the browser context's session cookie. Mutating requests carry the
 * same X-Requested-With header the real client sends (api-spec.md §0.1.3), so a rejection proves
 * authorization, not a missing CSRF header.
 */
export async function apiAsPage(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH',
  urlPath: string,
  data?: unknown,
) {
  return page.request.fetch(`${API_URL}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    data: data === undefined ? undefined : JSON.stringify(data),
  });
}

export interface TicketFormInput {
  category: string;
  relatedSystem: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  description: string;
}

/** Requester Create Ticket (Lab 2 screen under real auth); returns the generated Ticket Number. */
export async function createTicketViaUi(page: Page, input: TicketFormInput): Promise<string> {
  await page.goto('/tickets/new');
  await page.locator('#category-select').selectOption({ label: input.category });
  await page.locator('#related-system-select').selectOption({ label: input.relatedSystem });
  await page.locator('#priority-select').selectOption(input.priority);
  await page.locator('#summary-input').fill(input.summary);
  await page.locator('#description-textarea').fill(input.description);
  await page.getByRole('button', { name: 'Submit Ticket' }).click();
  const ticketNumberEl = page.getByTestId('ticket-number-display');
  await ticketNumberEl.waitFor({ state: 'visible' });
  return (await ticketNumberEl.textContent())?.trim() ?? '';
}

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal overflow: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`).toBeLessThanOrEqual(
    clientWidth + 1,
  );
}

/**
 * True when the focused element shows a visible focus indicator, as an outline (Zen Green
 * `.field-editable:focus`) or a box-shadow ring (Bootstrap `.btn:focus-visible`).
 */
export async function activeElementHasVisibleFocusRing(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const style = getComputedStyle(el);
    const hasOutline = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
    const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
    return hasOutline || hasBoxShadow;
  });
}
