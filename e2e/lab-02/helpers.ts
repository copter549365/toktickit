import path from 'path';
import { expect, type Locator, type Page } from '@playwright/test';

export const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 850, height: 1100 },
  mobile: { width: 375, height: 812 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

export const TEST_IMAGE_PATH = path.join(__dirname, 'fixtures', 'test-photo.png');

export const SCREENSHOT_ROOT = path.resolve(__dirname, '../../artifacts/lab-02/screenshots');

export function screenshotPath(screen: 'create-ticket' | 'my-tickets' | 'ticket-detail', name: string) {
  return path.join(SCREENSHOT_ROOT, screen, `${name}.png`);
}

/** Seeded active Development Requesters (prisma/seed.ts). */
export const REQUESTERS = {
  A: 'Jennifer Anderson',
  B: 'Michael Chen',
} as const;

export async function selectRequester(page: Page, name: string): Promise<void> {
  await page.goto('/select-requester');
  await page.locator('#requester-select').selectOption({ label: name });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/tickets');
}

export async function changeRequester(page: Page, name: string): Promise<void> {
  // Below md, the shell nav (including "Change Requester") is collapsed behind a hamburger
  // toggle (ui-spec.md §4.1) and must be expanded before the button is clickable.
  const toggler = page.locator('.navbar-toggler');
  if (await toggler.isVisible()) {
    await toggler.click();
  }
  await page.getByRole('button', { name: 'Change Requester' }).click();
  await page.waitForURL('**/select-requester');
  await selectRequester(page, name);
}

export interface TicketFormInput {
  category: string;
  relatedSystem: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  description: string;
}

/** Fills and submits the Create Ticket form; returns the backend-generated Ticket Number. */
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

/**
 * Presses Tab until `target` is the focused element, proving the control is reachable via
 * keyboard alone without hard-coding the exact tab-stop count (AC-28). Takes a Locator (rather
 * than a raw CSS selector) so callers can use Playwright's role/text queries, which a native
 * `Element.matches()` call cannot evaluate.
 */
export async function tabTo(page: Page, target: Locator, maxPresses = 20): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    const isFocused = await target.evaluate((el) => el === document.activeElement).catch(() => false);
    if (isFocused) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/**
 * True when the focused element has a visible focus indicator, whether implemented as an outline
 * (our `.field-editable:focus` rule) or a box-shadow ring (Bootstrap's default `.btn:focus`).
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

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (scrollWidth > clientWidth + 1) {
    throw new Error(`Horizontal scroll detected: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`);
  }
}
