/**
 * Dedicated E2E accounts, reset to exactly this state by global-setup.ts before each run.
 * Kept separate from the prisma/seed.ts accounts so the suite never changes the passwords of the
 * people used for manual demos.
 */
export const E2E_PASSWORD = 'E2eJourney#2026';

/** Prefix for accounts the Admin journeys create; global-setup.ts removes stale ones. */
export const TEMP_EMAIL_PREFIX = 'e2e-tmp-';

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

interface E2EUser {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
}

export const E2E_USERS = {
  requester: {
    name: 'E2E Requester',
    email: 'e2e.requester@toktickit.com',
    role: 'REQUESTER',
    isActive: true,
    mustChangePassword: false,
  },
  staff: {
    name: 'E2E Staff Primary',
    email: 'e2e.staff@toktickit.com',
    role: 'IT_STAFF',
    isActive: true,
    mustChangePassword: false,
  },
  staffSecondary: {
    name: 'E2E Staff Secondary',
    email: 'e2e.staff2@toktickit.com',
    role: 'IT_STAFF',
    isActive: true,
    mustChangePassword: false,
  },
  admin: {
    name: 'E2E Administrator',
    email: 'e2e.admin@toktickit.com',
    role: 'ADMINISTRATOR',
    isActive: true,
    mustChangePassword: false,
  },
  firstLogin: {
    name: 'E2E First Login',
    email: 'e2e.firstlogin@toktickit.com',
    role: 'REQUESTER',
    isActive: true,
    mustChangePassword: true,
  },
  // Never completes the gate, so the responsive suite can always capture the Change Password screen.
  passwordGate: {
    name: 'E2E Password Gate',
    email: 'e2e.passwordgate@toktickit.com',
    role: 'REQUESTER',
    isActive: true,
    mustChangePassword: true,
  },
  inactive: {
    name: 'E2E Inactive Requester',
    email: 'e2e.inactive@toktickit.com',
    role: 'REQUESTER',
    isActive: false,
    mustChangePassword: false,
  },
} as const satisfies Record<string, E2EUser>;

export type E2EUserKey = keyof typeof E2E_USERS;
