import { test, expect, type Page } from '@playwright/test';
import { E2E_USERS, TEMP_EMAIL_PREFIX } from './fixtures';
import { apiAsPage, fillLogin, loginAs, runToken, screenshotPath, signOut } from './helpers';

/**
 * E2E-05, E2E-09 (docs/lab-03/tests.md): minimalist Administrator User Management — list, search,
 * role filter, create with one role and an initial password, duplicate/invalid input, edit,
 * activation, new initial password forcing a change at next login, the self-deactivation and
 * last-active-Administrator safety rules, and forbidden access for non-Administrators.
 */

function userRow(page: Page, email: string) {
  return page.locator('[data-testid^="user-row-"]', { hasText: email });
}

async function searchUsers(page: Page, text: string) {
  await page.locator('#user-search-input').fill(text);
}

async function openEdit(page: Page, email: string) {
  await searchUsers(page, email);
  await expect(page.locator('[data-testid^="user-row-"]')).toHaveCount(1);
  await userRow(page, email).getByRole('button', { name: 'Edit User' }).click();
  return page.getByRole('dialog', { name: 'Edit User' });
}

/** Completes the mandatory Change Password gate and returns the new password. */
async function completePasswordChange(page: Page, currentPassword: string, newPassword: string) {
  await expect(page).toHaveURL(/\/change-password$/);
  await page.locator('#current-password').fill(currentPassword);
  await page.locator('#new-password').fill(newPassword);
  await page.locator('#confirm-password').fill(newPassword);
  await page.getByRole('button', { name: 'Update Password and Enter' }).click();
}

test.describe('E2E-05: User list, search, and role filter', () => {
  test('lists Name, Email, Role, Status and Edit; search and role filter narrow the list', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/admin\/users$/);

    const table = page.getByTestId('user-management-table');
    for (const header of ['Full Name', 'Email Address', 'Role', 'Status', 'Actions']) {
      await expect(table.getByRole('columnheader', { name: header })).toBeVisible();
    }
    await page.screenshot({ path: screenshotPath('user-management', 'admin-user-list-desktop'), fullPage: true });

    // Search by email fragment.
    await searchUsers(page, 'e2e.staff');
    await expect(userRow(page, E2E_USERS.staff.email)).toBeVisible();
    await expect(userRow(page, E2E_USERS.staffSecondary.email)).toBeVisible();
    await expect(userRow(page, E2E_USERS.admin.email)).toHaveCount(0);

    // Search by name, case-insensitive.
    await searchUsers(page, 'e2e inactive requester');
    const inactiveRow = userRow(page, E2E_USERS.inactive.email);
    await expect(inactiveRow).toBeVisible();
    await expect(inactiveRow).toContainText('Inactive');
    await expect(page.locator('[data-testid^="user-row-"]')).toHaveCount(1);

    // Role filter alone: every row is IT Staff.
    await searchUsers(page, '');
    await page.locator('#user-role-filter').selectOption('IT_STAFF');
    await expect(userRow(page, E2E_USERS.staff.email)).toBeVisible();
    const roles = await page.locator('[data-testid^="user-row-"] td:nth-child(3)').allTextContents();
    expect(roles.length).toBeGreaterThan(0);
    expect(new Set(roles)).toEqual(new Set(['IT Staff']));
    await page.screenshot({ path: screenshotPath('user-management', 'admin-user-list-filtered-role'), fullPage: true });

    // No results.
    await searchUsers(page, 'no-such-person-zzz');
    await expect(page.getByText('No users match your filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear Filters' }).last().click();
    await expect(page.locator('#user-role-filter')).toHaveValue('');
  });
});

test.describe.serial('E2E-05 / E2E-09: Create, edit, reset password, deactivate', () => {
  const token = runToken('adm').toLowerCase();
  const email = `${TEMP_EMAIL_PREFIX}${token}@toktickit.com`;
  const name = `E2E Temp ${token}`;
  let initialPassword = '';
  const firstOwnPassword = 'MyOwnSecret#2026';

  test('create validates input, rejects duplicates and invalid roles, and creates a user with one role', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.getByRole('button', { name: 'Create New User' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create New User' });

    // The initial password is pre-generated to satisfy BR-07.
    const generated = await dialog.locator('#create-initial-password').inputValue();
    expect(generated).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/);

    // Invalid input: blank name, malformed email, weak password.
    await dialog.locator('#create-email').fill('not-an-email');
    await dialog.locator('#create-initial-password').fill('weak');
    await dialog.getByRole('button', { name: 'Save User' }).click();
    await expect(dialog.getByText('Name is required.')).toBeVisible();
    await expect(dialog.getByText('A valid email address is required.')).toBeVisible();
    await expect(dialog.locator('#create-initial-password')).toHaveClass(/field-invalid/);

    // Duplicate email (case-insensitive).
    await dialog.locator('#create-name').fill(name);
    await dialog.locator('#create-email').fill(E2E_USERS.staff.email.toUpperCase());
    await dialog.getByRole('button', { name: 'Generate' }).click();
    await dialog.getByRole('button', { name: 'Save User' }).click();
    await expect(dialog.getByText('A user with this email address already exists.')).toBeVisible();

    // Invalid role cannot be chosen in the UI, and the API refuses it too.
    const roleOptions = await dialog.locator('#create-role option').allTextContents();
    expect(roleOptions).toEqual(['Requester', 'IT Staff', 'Administrator']);
    const badRole = await apiAsPage(page, 'POST', '/api/admin/users', {
      name: 'Bad Role',
      email: `${TEMP_EMAIL_PREFIX}badrole-${token}@toktickit.com`,
      role: 'SUPERUSER',
      initialPassword: 'ValidPass#2026',
    });
    expect(badRole.status()).toBe(400);
    expect((await badRole.json()).fieldErrors.role).toBeTruthy();
    const twoRoles = await apiAsPage(page, 'POST', '/api/admin/users', {
      name: 'Two Roles',
      email: `${TEMP_EMAIL_PREFIX}tworoles-${token}@toktickit.com`,
      role: ['IT_STAFF', 'ADMINISTRATOR'],
      initialPassword: 'ValidPass#2026',
    });
    expect(twoRoles.status()).toBe(400);

    // Valid create.
    await dialog.locator('#create-email').fill(email);
    await dialog.locator('#create-role').selectOption('IT_STAFF');
    initialPassword = await dialog.locator('#create-initial-password').inputValue();
    await page.screenshot({ path: screenshotPath('user-management', 'admin-create-user-drawer'), fullPage: true });
    await dialog.getByRole('button', { name: 'Save User' }).click();
    await expect(dialog).toHaveCount(0);

    await searchUsers(page, email);
    const row = userRow(page, email);
    await expect(row).toContainText(name);
    await expect(row).toContainText('IT Staff');
    await expect(row).toContainText('Active');
  });

  test('the new user must change the initial password at first login', async ({ page }) => {
    await fillLogin(page, email, initialPassword);
    await completePasswordChange(page, initialPassword, firstOwnPassword);
    await expect(page).toHaveURL(/\/staff\/tickets$/);
    await expect(page.getByTestId('auth-user-name')).toHaveText(name);
  });

  test('admin edits name, email, and role; the change takes effect for the user', async ({ page }) => {
    await loginAs(page, 'admin');
    const dialog = await openEdit(page, email);
    await dialog.locator('#edit-name').fill(`${name} Renamed`);
    await dialog.locator('#edit-role').selectOption('REQUESTER');
    // Only a single role can be selected.
    expect(await dialog.locator('#edit-role').evaluate((el) => (el as HTMLSelectElement).multiple)).toBe(false);
    await page.screenshot({ path: screenshotPath('user-management', 'admin-edit-user-drawer'), fullPage: true });
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toHaveCount(0);

    const row = userRow(page, email);
    await expect(row).toContainText(`${name} Renamed`);
    await expect(row).toContainText('Requester');

    // Duplicate email on edit is rejected too.
    const again = await openEdit(page, email);
    await again.locator('#edit-email').fill(E2E_USERS.requester.email);
    await again.getByRole('button', { name: 'Save Changes' }).click();
    await expect(again.getByText('A user with this email address already exists.')).toBeVisible();
    await again.getByRole('button', { name: 'Cancel' }).click();

    await signOut(page);
    await fillLogin(page, email, firstOwnPassword);
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.locator('header').getByText('Requester', { exact: true })).toBeVisible();
  });

  test('a new initial password forces another change at next login', async ({ page }) => {
    await loginAs(page, 'admin');
    const dialog = await openEdit(page, email);
    await expect(dialog.getByRole('button', { name: 'Reset Password' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Generate' }).click();
    const resetTo = await dialog.getByLabel('New initial password').inputValue();
    expect(resetTo.length).toBeGreaterThanOrEqual(8);
    await dialog.getByRole('button', { name: 'Reset Password' }).click();
    await expect(dialog.getByRole('status')).toHaveText('✓ Password reset. The user must change it at next login.');
    await page.screenshot({ path: screenshotPath('user-management', 'admin-reset-initial-password-modal'), fullPage: true });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await signOut(page);

    // The user's own password stops working; the new initial one opens only the gate.
    await fillLogin(page, email, firstOwnPassword);
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
    await fillLogin(page, email, resetTo);
    await expect(page).toHaveURL(/\/change-password$/);
    await page.goto('/tickets');
    await expect(page).toHaveURL(/\/change-password$/);
    await completePasswordChange(page, resetTo, 'SecondSecret#2026');
    await expect(page).toHaveURL(/\/tickets$/);
  });

  test('deactivation blocks login; reactivation restores it', async ({ page }) => {
    await loginAs(page, 'admin');
    let dialog = await openEdit(page, email);
    await dialog.getByLabel('Active').uncheck();
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(userRow(page, email)).toContainText('Inactive');
    await signOut(page);

    await fillLogin(page, email, 'SecondSecret#2026');
    await expect(page.getByRole('alert')).toHaveText('This account has been deactivated. Please contact an administrator.');

    await loginAs(page, 'admin');
    dialog = await openEdit(page, email);
    await dialog.getByLabel('Active').check();
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(userRow(page, email)).toContainText('Active');
    await signOut(page);

    await fillLogin(page, email, 'SecondSecret#2026');
    await expect(page).toHaveURL(/\/tickets$/);
  });
});

test.describe('E2E-05: Administrator safety rules', () => {
  test('an Administrator cannot deactivate their own account (UI and API)', async ({ page }) => {
    await loginAs(page, 'admin');
    const dialog = await openEdit(page, E2E_USERS.admin.email);
    const toggle = dialog.getByLabel('Active');
    await expect(toggle).toBeDisabled();
    await expect(toggle).toBeChecked();
    await expect(dialog.getByText('You cannot deactivate your own account.')).toBeVisible();
    await page.screenshot({ path: screenshotPath('user-management', 'admin-self-deactivation-blocked'), fullPage: true });
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    const me = await (await apiAsPage(page, 'GET', '/api/auth/me')).json();
    const response = await apiAsPage(page, 'PATCH', `/api/admin/users/${me.user.id}`, { isActive: false });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('SELF_DEACTIVATION_PROHIBITED');

    // Still active and still signed in.
    await page.reload();
    await expect(page.getByTestId('auth-user-name')).toHaveText(E2E_USERS.admin.name);
  });

  test('the last-active-Administrator refusal is shown safely in the edit dialog', async ({ page }) => {
    // The shared development database always holds several active Administrators (seed + fixtures),
    // so the real BR-19 rule is proven against an isolated state by API-29 in
    // server/tests/lab-03/users-admin.api.test.ts. Here the server's refusal is simulated to verify
    // the UI presents it clearly and keeps the dialog open without applying the change.
    await loginAs(page, 'admin');
    await page.route('**/api/admin/users/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'LAST_ADMIN_PROTECTION',
              message: 'The last active Administrator cannot be deactivated or have their role changed.',
            }),
          })
        : route.continue(),
    );
    const dialog = await openEdit(page, E2E_USERS.admin.email);
    await dialog.locator('#edit-role').selectOption('IT_STAFF');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'The last active Administrator cannot be deactivated or have their role changed.',
    );
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: screenshotPath('user-management', 'admin-last-admin-protection'), fullPage: true });
  });
});

test.describe('E2E-05: Forbidden access for non-Administrators', () => {
  for (const key of ['requester', 'staff'] as const) {
    test(`${key} sees a forbidden state and the admin API refuses them`, async ({ page }) => {
      await loginAs(page, key);
      await expect(page.locator('header').getByRole('link', { name: 'User Management' })).toHaveCount(0);

      await page.goto('/admin/users');
      await expect(page.getByText('You do not have permission to view this page.')).toBeVisible();
      await expect(page.getByTestId('user-management-table')).toHaveCount(0);

      const list = await apiAsPage(page, 'GET', '/api/admin/users');
      expect(list.status()).toBe(403);
      expect(await list.text()).not.toContain('@toktickit.com');

      const create = await apiAsPage(page, 'POST', '/api/admin/users', {
        name: 'Should Not Exist',
        email: `${TEMP_EMAIL_PREFIX}forbidden-${key}@toktickit.com`,
        role: 'ADMINISTRATOR',
        initialPassword: 'ValidPass#2026',
      });
      expect(create.status()).toBe(403);

      if (key === 'staff') {
        await page.screenshot({ path: screenshotPath('user-management', 'admin-forbidden-it-staff'), fullPage: true });
      }
    });
  }
});
