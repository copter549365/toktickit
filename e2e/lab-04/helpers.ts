import { randomUUID } from 'crypto';
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import { apiAsPage, createTicketViaUi, loginAs, signOut } from '../lab-03/helpers';

/** Shared Lab 4 journey helpers (Actions Taken section, ticket setup). */

export const actionsSection = (page: Page) => page.locator('#actions-taken');
export const actionsTable = (page: Page) => actionsSection(page).getByRole('table');
export const createActionForm = (page: Page) => page.getByRole('form', { name: 'Add Action' });

/** The segmented Status control: the radio is visually hidden, so click its visible label. */
export async function pickStatus(form: Locator, label: 'Planned' | 'In Progress' | 'Completed') {
  await form.getByRole('radiogroup', { name: 'Status' }).getByText(label, { exact: true }).click();
  await expect(form.getByRole('radio', { name: label })).toBeChecked();
}

export async function ticketIdForToken(page: Page, token: string): Promise<number> {
  const res = await apiAsPage(page, 'GET', `/api/tickets?search=${encodeURIComponent(token)}`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.data).toHaveLength(1);
  return body.data[0].id;
}

export async function myId(page: Page): Promise<number> {
  const res = await apiAsPage(page, 'GET', '/api/auth/me');
  return (await res.json()).user.id;
}

export async function createActionViaApi(
  page: Page,
  ticketId: number,
  description: string,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const res = await apiAsPage(page, 'POST', `/api/tickets/${ticketId}/actions`, {
    clientRequestId: randomUUID(),
    description,
    ...extra,
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id;
}

export async function actionRow(page: Page, description: string): Promise<Locator> {
  const row = actionsTable(page).locator('tr[data-action-id]', { hasText: description });
  await expect(row).toHaveCount(1);
  return row;
}

export async function openStaffTicket(page: Page, ticketId: number) {
  await page.goto(`/staff/tickets/${ticketId}`);
  await expect(actionsSection(page).getByRole('heading', { name: /^Actions Taken \(\d+\)$/ })).toBeVisible();
}

/** A Requester Ticket the primary staff member owns, ready for work. Leaves `staff` signed in. */
export async function prepareTicket(page: Page, token: string): Promise<number> {
  await loginAs(page, 'requester');
  await createTicketViaUi(page, {
    category: 'Hardware',
    relatedSystem: 'Corporate Laptop',
    priority: 'MEDIUM',
    summary: `${token} Laptop battery drains within an hour`,
    description: 'The laptop battery drains from full to 10% within an hour of unplugging it.',
  });
  const ticketId = await ticketIdForToken(page, token);
  await signOut(page);

  await loginAs(page, 'staff');
  const res = await apiAsPage(page, 'PATCH', `/api/staff/tickets/${ticketId}/owner`, { ticketOwnerId: await myId(page) });
  expect(res.ok()).toBe(true);
  return ticketId;
}
