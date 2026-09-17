import { defineConfig, devices } from '@playwright/test';

/**
 * Lab 2 E2E + responsive-visual suite (Issue 7). Runs against the real Express API and a real
 * PostgreSQL database (via Docker Compose) rather than mocks, matching the server/client test
 * conventions established in Issues 3-6.
 */
export default defineConfig({
  testDir: './e2e/lab-02',
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
