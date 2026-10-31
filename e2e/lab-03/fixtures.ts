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
  // Lab 4 (E2E-L4-09): a Requester who never creates a ticket, for the all-zero dashboard. It is the
  // E2E twin of the seeded nina.wong, whose password the suite must not change.
  requesterEmpty: {
    name: 'E2E Requester Empty',
    email: 'e2e.requester.empty@toktickit.com',
    role: 'REQUESTER',
    isActive: true,
    mustChangePassword: false,
  },
  // Lab 4 (E2E-L4-09): IT Staff who never own a ticket or get an action, the E2E twin of the
  // seeded olivia.chen.
  staffEmpty: {
    name: 'E2E Staff Empty',
    email: 'e2e.staff.empty@toktickit.com',
    role: 'IT_STAFF',
    isActive: true,
    mustChangePassword: false,
  },
  // Lab 4 (E2E-L4-07): assignee for the My Open Actions journey. The dashboard lists the 5 oldest
  // open actions, so global-setup.ts cancels this account's leftovers before every run.
  staffActions: {
    name: 'E2E Staff Actions',
    email: 'e2e.staff.actions@toktickit.com',
    role: 'IT_STAFF',
    isActive: true,
    mustChangePassword: false,
  },
  // Lab 4 (E2E-L4-02): an inactive IT Staff member that Actions Taken must refuse as assignee (BR-06).
  staffInactive: {
    name: 'E2E Inactive Staff',
    email: 'e2e.staff.inactive@toktickit.com',
    role: 'IT_STAFF',
    isActive: false,
    mustChangePassword: false,
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
