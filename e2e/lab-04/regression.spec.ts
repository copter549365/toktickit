import { test, expect } from './fixtures';
import { TEMP_EMAIL_PREFIX } from '../lab-03/fixtures';
import { apiAsPage, createTicketViaUi, fillLogin, loginAs, runToken, signOut } from '../lab-03/helpers';

/**
 * E2E-L4-12 (docs/lab-04/tests.md §2.8; AC-24, FR-18, FR-22): one representative journey through
 * the Lab 2 and Lab 3 features on the Lab 4 build, plus the release leftovers check.
 * An Administrator creates a Requester; the Requester completes the first-login password change,
 * creates a Ticket with an attachment and finds it in My Tickets; IT Staff post a Public Comment
 * and an amber Internal Note; the Requester sees the comment but never the note; the
 * Administrator deactivates the account and sign-in is refused.
 */

// A real 1×1 PNG, so the upload passes the server's type checks.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe.serial('E2E-L4-12: representative Lab 2–3 regression on the Lab 4 build', () => {
  const token = runToken('E2E-L4-12');
  const email = `${TEMP_EMAIL_PREFIX}${token.toLowerCase()}@toktickit.com`;
  const name = 'Regression Requester';
  const ownPassword = 'Regression#2026';
  const comment = `${token} We replaced the power adapter.`;
  const note = `${token} Adapter came from spare stock, bin 4.`;
  let initialPassword = '';
  let ticketId = 0;

  test('the build has no template leftovers: real title, 16px base font, no debug frame', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle('TokTickIT');
    const style = await page.evaluate(() => ({
      rootFont: getComputedStyle(document.documentElement).fontSize,
      rootBorder: getComputedStyle(document.getElementById('root')!).borderLeftWidth,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(style.rootFont).toBe('16px'); // Lab 2 ui-spec: base font size 16px
    expect(style.rootBorder).toBe('0px');
    expect(style.colorScheme).not.toContain('dark');
  });

  test('an Administrator creates a Requester account', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Create New User' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create New User' });
    await dialog.locator('#create-name').fill(name);
    await dialog.locator('#create-email').fill(email);
    await dialog.locator('#create-role').selectOption('REQUESTER');
    initialPassword = await dialog.locator('#create-initial-password').inputValue();
    await dialog.getByRole('button', { name: 'Save User' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('the Requester changes the initial password at first sign-in and lands on the Dashboard', async ({ page }) => {
    await fillLogin(page, email, initialPassword);
    await expect(page).toHaveURL(/\/change-password$/);
    await page.goto('/tickets'); // the gate holds even on a direct link
    await expect(page).toHaveURL(/\/change-password$/);
    await page.locator('#current-password').fill(initialPassword);
    await page.locator('#new-password').fill(ownPassword);
    await page.locator('#confirm-password').fill(ownPassword);
    await page.getByRole('button', { name: 'Update Password and Enter' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("You haven't created any tickets yet")).toBeVisible();
  });

  test('the Requester creates a Ticket, adds an attachment, and finds it with My Tickets search', async ({ page }) => {
    await fillLogin(page, email, ownPassword);
    await expect(page).toHaveURL(/\/dashboard$/);
    const ticketNumber = await createTicketViaUi(page, {
      category: 'Hardware',
      relatedSystem: 'Corporate Laptop',
      priority: 'MEDIUM',
      summary: `${token} Laptop does not charge`,
      description: 'The laptop stopped charging this morning with the usual adapter.',
    });
    await page.getByRole('button', { name: 'View Ticket' }).click();
    await expect(page).toHaveURL(/\/tickets\/\d+$/);
    ticketId = Number(page.url().split('/').pop());

    await page.locator('#add-attachment-input').setInputFiles({ name: 'adapter.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByTestId('attachment-section').getByText('adapter.png').first()).toBeVisible();

    await page.goto('/tickets');
    await page.locator('#tickets-search-input').fill(token);
    await expect(page.getByTestId('my-tickets-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('my-tickets-table')).toContainText(ticketNumber);
  });

  test('IT Staff post a Public Comment and an amber Internal Note', async ({ page }) => {
    await loginAs(page, 'staff');
    await page.goto(`/staff/tickets/${ticketId}`);
    await page.locator('#new-comment').fill(comment);
    await page.getByRole('button', { name: 'Post Comment' }).click();
    await expect(page.getByText(comment)).toBeVisible();

    const notes = page.getByTestId('internal-notes-section');
    await notes.locator('#new-note').fill(note);
    await notes.getByRole('button', { name: 'Save Internal Note' }).click();
    await expect(notes.getByText(note)).toBeVisible();
    await expect(notes).toHaveCSS('border-top-color', 'rgb(179, 107, 0)'); // --color-warning frame
  });

  test('the Requester sees the comment but never the Internal Note', async ({ page }) => {
    await fillLogin(page, email, ownPassword);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/tickets/${ticketId}`);
    await expect(page.getByText(comment)).toBeVisible();
    await expect(page.getByText(note)).toHaveCount(0);
    await expect(page.getByTestId('internal-notes-section')).toHaveCount(0);
    const notesApi = await apiAsPage(page, 'GET', `/api/tickets/${ticketId}/notes`);
    expect(notesApi.status()).toBe(403);
    expect(await notesApi.text()).not.toContain(token);
    await signOut(page);
  });

  test('the Administrator deactivates the account, and sign-in is refused', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await page.locator('#user-search-input').fill(email);
    await page.locator('[data-testid^="user-row-"]', { hasText: email }).getByRole('button', { name: 'Edit User' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit User' });
    await dialog.getByLabel('Active').uncheck();
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toHaveCount(0);
    await signOut(page);

    await fillLogin(page, email, ownPassword);
    await expect(page.getByRole('alert')).toHaveText('This account has been deactivated. Please contact an administrator.');
  });
});
