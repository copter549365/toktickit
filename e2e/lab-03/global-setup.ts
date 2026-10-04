import 'dotenv/config';
import bcrypt from 'bcrypt';
import { Client } from 'pg';
import { E2E_PASSWORD, E2E_USERS, TEMP_EMAIL_PREFIX } from './fixtures';

/**
 * Puts the dedicated E2E accounts into a known state before every run (Issue 8).
 *
 * Every seeded account starts with `mustChangePassword = true` and a shared initial password, and
 * the E2E suite itself changes passwords and deactivates accounts, so the journeys can only be
 * deterministic if these rows are reset first. This mirrors the upsert-in-beforeAll pattern the
 * server API suites use (e.g. users-admin.api.test.ts), but goes straight to PostgreSQL because
 * Playwright runs outside the server package. The regular seed accounts are never touched.
 */
export default async function globalSetup(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const passwordHash = await bcrypt.hash(E2E_PASSWORD, 10);

    for (const user of Object.values(E2E_USERS)) {
      await client.query(
        `INSERT INTO "User" (name, email, "passwordHash", role, "isActive", "mustChangePassword", "updatedAt")
         VALUES ($1, $2, $3, $4::"UserRole", $5, $6, NOW())
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           "passwordHash" = EXCLUDED."passwordHash",
           role = EXCLUDED.role,
           "isActive" = EXCLUDED."isActive",
           "mustChangePassword" = EXCLUDED."mustChangePassword",
           "updatedAt" = NOW()`,
        [user.name, user.email, passwordHash, user.role, user.isActive, user.mustChangePassword],
      );
    }

    // Accounts created through the Admin UI in earlier runs. Users cannot be deleted through the
    // product (BR-21), but these throwaway rows own no tickets, comments, or notes, so removing
    // them directly keeps the User Management list from growing without bound.
    await client.query(
      `DELETE FROM "User" u
       WHERE u.email LIKE $1
         AND NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t."requesterId" = u.id OR t."ticketOwnerId" = u.id)
         AND NOT EXISTS (SELECT 1 FROM "PublicComment" c WHERE c."authorId" = u.id)
         AND NOT EXISTS (SELECT 1 FROM "InternalNote" n WHERE n."authorId" = u.id)`,
      [`${TEMP_EMAIL_PREFIX}%`],
    );
  } finally {
    await client.end();
  }
}
