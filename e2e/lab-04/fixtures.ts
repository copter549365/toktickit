import path from 'path';
import { test as base, expect } from '@playwright/test';

/**
 * E2E-L4-10 (docs/lab-04/tests.md): every Lab 4 spec imports `test` from here, so any
 * `console.error` or uncaught page error fails the test, and no visited page may show placeholder
 * text. Chrome's own "Failed to load resource" lines are skipped: the journeys deliberately
 * provoke 400/409 responses, and those are asserted on directly.
 */
const PLACEHOLDER_TEXT = /\bTODO\b|Lorem ipsum|Development Requester/i;

export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
          problems.push(`console.error: ${msg.text()}`);
        }
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

      await use();

      if (!page.isClosed() && page.url().startsWith('http')) {
        const text = await page.locator('body').innerText().catch(() => '');
        expect(text, 'placeholder text on the page').not.toMatch(PLACEHOLDER_TEXT);
      }
      expect(problems, 'console errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const LAB4_SCREENSHOT_ROOT = path.resolve(__dirname, '../../artifacts/lab-04/screenshots');

export type Lab4ScreenshotGroup = 'actions-taken' | 'staff-dashboard' | 'requester-dashboard' | 'workflow';

export function lab4Screenshot(group: Lab4ScreenshotGroup, name: string): string {
  return path.join(LAB4_SCREENSHOT_ROOT, group, `${name}.png`);
}
