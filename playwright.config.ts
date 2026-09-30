import { defineConfig, devices } from '@playwright/test';

/**
 * Lab 3 E2E + responsive-visual suite (Issue 8). Runs against the real Express API and a real
 * PostgreSQL database (via Docker Compose) rather than mocks. global-setup.ts resets the dedicated
 * e2e.* accounts first so authentication journeys are repeatable on a shared dev database.
 *
 * The Lab 2 suite (e2e/lab-02) drove the Development Requester selector, which Lab 3 removed; its
 * flows are now covered under real auth by these specs and server/tests/lab-03/requester-regression.
 */
export default defineConfig({
  testDir: './e2e/lab-03',
  globalSetup: './e2e/lab-03/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: './server',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: './client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
