import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERS } from './fixtures';
import { API_URL, fillLogin, loginAs, screenshotPath, signOut } from './helpers';

/**
 * E2E-01, E2E-02, E2E-06 (docs/lab-03/tests.md): Login, mandatory first-login password change,
 * inactive accounts, safe failures, logout, and direct-access protection after logout — driven
 * through the real client, Express API, and PostgreSQL.
 */

test.describe('E2E-01: Login, role home, and logout', () => {
  test('each role lands on its own home with name, role badge, and only its own navigation', async ({ page }) => {
    const cases = [
      { key: 'requester', home: '/tickets', badge: 'Requester', nav: ['My Tickets', 'Create Ticket'] },
      { key: 'staff', home: '/staff/tickets', badge: 'IT Staff', nav: ['Ticket Queue'] },
      { key: 'admin', home: '/admin/users', badge: 'Administrator', nav: ['User Management'] },
    ] as const;
    const allNav = ['My Tickets', 'Create Ticket', 'Ticket Queue', 'User Management'];

    for (const c of cases) {
      await loginAs(page, c.key);
      await expect(page).toHaveURL(new RegExp(`${c.home}$`));
      const header = page.locator('header');
      await expect(header.getByText(c.badge, { exact: true })).toBeVisible();
      for (const label of allNav) {
        const link = header.getByRole('link', { name: label, exact: true });
        if ((c.nav as readonly string[]).includes(label)) {
          await expect(link).toBeVisible();
        } else {
          await expect(link).toHaveCount(0);
        }
      }
      if (c.key === 'requester') {
        await page.screenshot({ path: screenshotPath('authentication', 'app-shell-requester-desktop'), fullPage: true });
      }
      await signOut(page);
    }
  });

  test('logout removes authenticated access: protected screens and the API both reject afterwards', async ({ page }) => {
    await loginAs(page, 'requester');
    await signOut(page);

    for (const protectedPath of ['/tickets', '/tickets/new', '/staff/tickets', '/admin/users']) {
      await page.goto(protectedPath);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    const me = await page.request.get(`${API_URL}/api/auth/me`);
    expect(me.status()).toBe(401);
    const tickets = await page.request.get(`${API_URL}/api/tickets`);
    expect(tickets.status()).toBe(401);
  });

  test('session survives a full page reload', async ({ page }) => {
    await loginAs(page, 'staff');
    await page.reload();
    await expect(page.getByTestId('auth-user-name')).toHaveText(E2E_USERS.staff.name);
    await expect(page).toHaveURL(/\/staff\/tickets$/);
  });
});

test.describe('E2E-06: Invalid login, inactive account, validation, busy, and safe failure', () => {
  test('required-field validation renders inline without calling the API', async ({ page }) => {
    let loginCalls = 0;
    await page.route('**/api/auth/login', (route) => {
      loginCalls += 1;
      return route.continue();
    });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Email is required.')).toBeVisible();
    await expect(page.getByText('Password is required.')).toBeVisible();
    await expect(page.locator('#login-email')).toHaveAttribute('aria-invalid', 'true');
    expect(loginCalls).toBe(0);
  });

  test('wrong password shows a generic message that does not reveal whether the account exists', async ({ page }) => {
    await fillLogin(page, E2E_USERS.requester.email, 'WrongPassword#1');
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Invalid email or password.');
    await page.screenshot({ path: screenshotPath('authentication', 'login-error-safe'), fullPage: true });

    // Unknown email yields the identical message (no account enumeration).
    await fillLogin(page, 'nobody-here@toktickit.com', 'WrongPassword#1');
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('inactive account is refused with a clear, minimal message', async ({ page }) => {
    await fillLogin(page, E2E_USERS.inactive.email, E2E_PASSWORD);
    await expect(page.getByRole('alert')).toHaveText(
      'This account has been deactivated. Please contact an administrator.',
    );
    await expect(page).toHaveURL(/\/login$/);
    await page.screenshot({ path: screenshotPath('authentication', 'login-inactive-account'), fullPage: true });
  });

  test('busy state disables the form while signing in, and a server failure is reported safely', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }),
      });
    });
    await fillLogin(page, E2E_USERS.requester.email, E2E_PASSWORD);

    const busyButton = page.getByRole('button', { name: /Signing in/ });
    await expect(busyButton).toBeDisabled();
    await expect(page.locator('#login-email')).toBeDisabled();
    await page.screenshot({ path: screenshotPath('authentication', 'login-busy'), fullPage: true });

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Unable to sign in right now. Please try again.');
    await expect(alert).not.toContainText('An unexpected error occurred');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });
});

test.describe('E2E-02: Mandatory first-login password change', () => {
  test('normal screens stay unavailable until a valid new password is saved', async ({ page }) => {
    await fillLogin(page, E2E_USERS.firstLogin.email, E2E_PASSWORD);
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole('heading', { name: 'Change Your Password' })).toBeVisible();
    await page.screenshot({ path: screenshotPath('authentication', 'first-login-password-change-desktop'), fullPage: true });

    // App screens redirect back to the gate, and the API refuses too (not just the client).
    await page.goto('/tickets');
    await expect(page).toHaveURL(/\/change-password$/);
    const tickets = await page.request.get(`${API_URL}/api/tickets`);
    expect(tickets.status()).toBe(403);

    // Client-side validation: weak password + mismatch.
    await page.locator('#current-password').fill(E2E_PASSWORD);
    await page.locator('#new-password').fill('short');
    await page.locator('#confirm-password').fill('different');
    await page.getByRole('button', { name: 'Update Password and Enter' }).click();
    await expect(page.getByText('Password does not meet the complexity requirements.')).toBeVisible();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await page.screenshot({ path: screenshotPath('authentication', 'first-login-password-change-validation'), fullPage: true });

    // Server-side check: wrong current password.
    const newPassword = 'FreshStart#2026';
    await page.locator('#current-password').fill('NotTheCurrent#1');
    await page.locator('#new-password').fill(newPassword);
    await page.locator('#confirm-password').fill(newPassword);
    await page.getByRole('button', { name: 'Update Password and Enter' }).click();
    await expect(page.getByText('Current password is incorrect.')).toBeVisible();
    await expect(page).toHaveURL(/\/change-password$/);

    // Checklist reflects the compliant password.
    await expect(page.locator('.zg-password-checklist li.is-met')).toHaveCount(3);

    await page.locator('#current-password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Update Password and Enter' }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.getByTestId('auth-user-name')).toHaveText(E2E_USERS.firstLogin.name);

    // The old initial password no longer works; the new one does, without the gate.
    await signOut(page);
    await fillLogin(page, E2E_USERS.firstLogin.email, E2E_PASSWORD);
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
    await fillLogin(page, E2E_USERS.firstLogin.email, newPassword);
    await expect(page).toHaveURL(/\/tickets$/);
  });
});
