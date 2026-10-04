# Lab 3 Sprint Engineering Specification

Status: Specified (Issue 1 — Spec-DD / Test-DD). Implementation begins only after this contract, `tests.md`, `ui-spec.md`, and `api-spec.md` are approved.

---

## 1. Sprint Goal

Replace the temporary Development Requester selector with secure email/password authentication, server-enforced role-based authorization (Requester, IT Staff, Administrator), and mandatory first-login password change. Evolve the existing Lab 2 data model to deliver an operational IT Staff Ticket Queue with search/filter/sort/pagination, an IT Staff Ticket Detail screen supporting ownership assignment, IT Priority management, permitted status transitions, and role-restricted Internal Notes alongside shared Public Comments. Concurrently, provide a minimalist Administrator User Management screen for managing accounts and initial passwords under strict safety invariants, while preserving complete regression compatibility for authenticated Requesters within the Zen Green design system.

---

## 2. Stakeholder Request Interpretation

The stakeholder requires the TokTickIT system to transition from an exploratory development prototype into a multi-role operational support system:
1. **Real Authentication & Identity:** Eliminate the temporary Requester selector. Users must sign in using email and password. Users provisioned with an initial password must be forced to choose a strong password before gaining access to the application.
2. **Role-Based Access & Navigation:** The system must strictly distinguish between three roles:
   - **Requester:** Creates and manages their own tickets and attachments using their authenticated identity, interacts via Public Comments, and may signal when their reported issue appears resolved.
   - **IT Staff:** Operates a shared Ticket Queue, opens tickets, claims or reassigns ticket ownership, sets IT Priority, advances tickets through formal status workflows, interacts with Requesters via Public Comments, and collaborates privately using Internal Notes.
   - **Administrator:** Manages user accounts (viewing, creating, editing basic details, assigning one role, activating/deactivating accounts, issuing new initial passwords) with safety guardrails to prevent accidental lockouts. Administrators remain conceptually separate from IT Staff operations unless explicitly authorized.
3. **Defense in Depth:** Server-side authorization and ownership checks must protect every endpoint. Hiding or disabling UI buttons is only feedback, never a security control.
4. **Continuity & Consistency:** All existing Lab 2 ticket and attachment data must be preserved. The user interface must seamlessly extend the Zen Green design tokens, responsive conventions, and component patterns established in Lab 2.

---

## 3. Scope

### 3.1. Included

1. **Authentication & Session:**
   - Email and password login with secure password hashing (`bcrypt`).
   - Authenticated session management (HTTP-only cookie containing signed JWT token).
   - Mandatory first-login password change interceptor blocking standard application access until fulfilled.
   - Current user retrieval (`/api/auth/me`) and secure logout invalidation.
2. **Role-Based Authorization & Shell:**
   - Server-side role-based access control (RBAC) middleware for `REQUESTER`, `IT_STAFF`, and `ADMINISTRATOR`.
   - Dynamic application shell displaying authenticated user name and role badge, role-appropriate navigation, and logout action.
   - Elimination of the Development Requester selection screen and client-side acting identity header.
3. **Requester Regression & Public Comments:**
   - Preservation of all Lab 2 Requester capabilities (Create Ticket, My Tickets, Ticket Detail, Attachment upload, download, and soft removal) backed by authenticated identity (`req.user.id`).
   - Ability for Requesters to view and post Public Comments on their owned tickets.
   - Ability for Requesters to indicate that a reported issue "Appears Resolved" without bypassing IT Staff formal resolution.
   - Ability for Requesters to cancel their own unworked ticket (`NEW` → `CANCELLED`) with confirmation.
4. **IT Staff Ticket Queue:**
   - Queue view displaying all system tickets with Ticket No, Created Date, Summary, Category, Requested Priority, IT Priority, Current Status, Owner, and Last Updated.
   - Full search by ticket number or summary text.
   - Filtering by Category, Requested Priority, IT Priority, Status, and Owner.
   - Column sorting and pagination (page number, page size, total counts).
5. **IT Staff Ticket Detail & Operational Workflow:**
   - Ticket detail view with operational controls.
   - Claiming ticket ownership or reassigning to active IT Staff/Admin users.
   - Updating IT Priority.
   - Status transition management following a strict state machine with validation rules and confirmation dialogs.
   - Tabbed or divided view for Public Comments (visible to Requester, IT Staff, Admin) and Internal Notes (strictly visible to IT Staff and Admin only).
6. **Minimalist Administrator User Management:**
   - User listing showing Name, Email, Role, Status (Active/Inactive), and Edit action.
   - Search by name or email, and filter by role.
   - User creation with single role assignment and initial password.
   - Basic user detail editing (name, email, role, active status).
   - Resetting/issuing new initial passwords with mandatory next-login password change.
   - Administrator safety rules: duplicate email rejection, self-deactivation prevention, last-active-admin protection, deactivation instead of deletion.
7. **Database Migration & Seeding:**
   - Migration from Lab 2 `RequesterUser` to unified `User` model, linking existing tickets to migrated user records with mandatory initial password reset requirement.
   - Idempotent seed script providing required distributions of Requesters, IT Staff, Admins, tickets, comments, and notes.

### 3.2. Explicitly Excluded (Handout §4.2)

- Email invitations, password-reset emails, multi-factor authentication (MFA), social login, and SSO.
- Self-registration and Requester self-signup.
- "Actions Taken" operational checklist (deferred to Lab 4).
- Formal SLA calculations, automated escalation rules, and push/email notification services.
- Advanced dashboards and KPI analytics beyond simple queue counts.
- Multi-tenant organizations, departments, or customer administration.
- Production-grade cloud deployment or cloud infrastructure changes.
- Multiple roles assigned to a single user.
- User deletion, bulk user operations, user import/export, and account audit logs.
- Department, organization hierarchy, and user profile photo management.
- Account unlocking or administrator approval workflows.
- Advanced user-list features (e.g., mandatory pagination, multi-column sorting, multiple simultaneous compound filters).

---

## 4. Functional Requirements

### Authentication and Session
- **FR-01:** The system shall authenticate users using a valid email address and password.
- **FR-02:** The system shall return authenticated session credentials (HTTP-only secure JWT cookie) upon successful login.
- **FR-03:** The system shall intercept any user flagged with `mustChangePassword = true` and restrict their access exclusively to the password change endpoint and screen.
- **FR-04:** The system shall update the user's password, clear the `mustChangePassword` flag, and grant normal application access once a valid new password is saved.
- **FR-05:** The system shall invalidate the authenticated session upon user logout.
- **FR-06:** The system shall return the authenticated user's profile (id, name, email, role) via a current-user endpoint (`/api/auth/me`).

### Role-Based Authorization & Shell
- **FR-07:** The system shall enforce server-side role checks on every protected endpoint, returning `401 Unauthorized` for missing/invalid credentials and `403 Forbidden` for role mismatches.
- **FR-08:** The application shell shall display the logged-in user's full name, role badge, role-permitted navigation links, and a logout button.
- **FR-09:** The application shell shall present navigation for Requesters (`My Tickets`, `Create Ticket`), IT Staff (`Ticket Queue`, `Create Ticket`), and Administrators (`User Management`).

### Requester Regression & Continuous Ownership
- **FR-10:** The system shall derive the ticket creator and owner identity directly from the authenticated session, ignoring any client-supplied `requesterId`.
- **FR-11:** The system shall ensure Requesters can only access, view, and modify tickets and attachments that they own.
- **FR-12:** The system shall allow a Requester to append Public Comments to their owned tickets.
- **FR-13:** The system shall allow a Requester to flag their owned ticket as "Problem Appears Resolved" when in `IN_PROGRESS` or `WAITING_FOR_REQUESTER` status.
- **FR-13.1:** The system shall allow a Requester to cancel their own ticket if it is still in `NEW` status, requiring explicit confirmation.

### IT Staff Ticket Queue & Operations
- **FR-14:** The system shall provide an IT Staff Ticket Queue endpoint and view displaying tickets across all requesters.
- **FR-15:** The Ticket Queue shall support text search (by Ticket Number and Summary), filtering (by Category, Requested Priority, IT Priority, Status, and Owner), column sorting, and pagination.
- **FR-16:** The system shall allow IT Staff to claim an unassigned ticket or reassign ownership to any active IT Staff or Administrator.
- **FR-17:** The system shall allow IT Staff to update the IT Priority of any ticket.
- **FR-18:** The system shall allow IT Staff to advance or update ticket status in accordance with the permitted status transition rules.
- **FR-19:** The system shall allow IT Staff and Administrators to create and view Internal Notes on any ticket.
- **FR-20:** The system shall allow IT Staff and Administrators to create and view Public Comments on any ticket.

### Administrator User Management
- **FR-21:** The system shall provide an Administrator User Management screen listing all users with Name, Email, Role, Status, and Edit action.
- **FR-22:** The user list shall support searching by name or email, and filtering by role.
- **FR-23:** The system shall allow Administrators to create new user accounts with a designated role (`REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`), activation state, and initial password.
- **FR-24:** The system shall allow Administrators to edit existing user details (name, email, role, active status).
- **FR-25:** The system shall allow Administrators to reset a user's password to a new initial password, setting `mustChangePassword = true`.
- **FR-26:** The system shall enforce administrator safety rules to prevent system lockouts and duplicate data.

---

## 5. Business Rules

### Authentication & Account Security
- **BR-01 (Active User Only):** Only users with `isActive = true` and valid credentials may authenticate. Inactive users receive a safe authentication error.
- **BR-02 (Mandatory Password Change):** A user marked with `mustChangePassword = true` cannot access any application endpoint or screen except the password change API and screen until a new valid password is saved.
- **BR-03 (Authenticated Requester Identity):** The authenticated user identity (`req.user.id`), not any client-supplied `requesterId`, determines ownership and authorization for all Requester operations.
- **BR-04 (Public Comments Visibility):** Public Comments are visible to the ticket Requester, all IT Staff, and Administrators.
- **BR-05 (Internal Notes Visibility):** Internal Notes are strictly confidential and visible only to IT Staff and Administrators. Requesters must receive `403 Forbidden` (or `404 Not Found` if hiding resource existence) when requesting Internal Notes.
- **BR-06 (Requester Resolution Indication):** A Requester may indicate that their reported problem appears resolved, but cannot formally set the Ticket status to `RESOLVED` or `CLOSED`.
- **BR-07 (Password Complexity):** Passwords must be at least 8 characters in length, contain at least one uppercase letter, one lowercase letter, one number, and one special character.
- **BR-08 (Password Storage):** Passwords must never be stored in plaintext. Passwords must be hashed using `bcrypt` with a work factor of at least 10.
- **BR-09 (Initial Password Reset Flag):** Whenever an Administrator creates a user, or when existing Requesters are migrated with an initial password, or when a password is reset, `mustChangePassword` must automatically be set to `true`.

### Ticket Workflow, Ownership & Transition Matrix
- **BR-10 (Ticket Ownership Assignment):** A ticket may have zero or one primary Ticket Owner. The owner must be an active user with role `IT_STAFF` or `ADMINISTRATOR`. A newly created ticket defaults to unassigned (`ticketOwnerId = null`).
- **BR-11 (IT Priority Initialization):** When a ticket is created, `itPriority` is automatically initialized to equal the `requestedPriority`. Subsequent changes to `itPriority` may only be performed by IT Staff or Administrators.
- **BR-12 (Permitted Ticket Statuses):** The system supports exactly 8 statuses:
  1. `NEW`
  2. `OPEN`
  3. `IN_PROGRESS`
  4. `WAITING_FOR_REQUESTER`
  5. `RESOLVED`
  6. `CLOSED`
  7. `REOPENED`
  8. `CANCELLED`

- **BR-13 (Status Transition Matrix & Role Rules):**

| Current Status | Permitted Target Status | Permitted Roles | Required UI Confirmation | Validation & Business Behavior |
|---|---|---|---|---|
| `NEW` | `OPEN` | `IT_STAFF`, `ADMINISTRATOR` | No | Moves ticket into active triage; ticket may remain unassigned or be claimed. |
| `NEW` | `IN_PROGRESS` | `IT_STAFF`, `ADMINISTRATOR` | No | Fast-tracks ticket directly into active work. |
| `NEW` | `CANCELLED` | `REQUESTER` (Owner only), `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Requester may cancel their own unworked ticket. IT Staff may cancel invalid tickets. Requires confirmation. |
| `OPEN` | `IN_PROGRESS` | `IT_STAFF`, `ADMINISTRATOR` | No | Work commences on ticket. |
| `OPEN` | `WAITING_FOR_REQUESTER`| `IT_STAFF`, `ADMINISTRATOR` | No | Staff requested additional clarification from Requester. |
| `OPEN` | `CANCELLED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Cancellation after intake triage. |
| `IN_PROGRESS` | `WAITING_FOR_REQUESTER`| `IT_STAFF`, `ADMINISTRATOR` | No | Work paused pending Requester input. |
| `IN_PROGRESS` | `RESOLVED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Requires non-empty `resolutionSummary` (min 5 chars). |
| `IN_PROGRESS` | `CANCELLED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Requires confirmation. |
| `WAITING_FOR_REQUESTER`| `IN_PROGRESS` | `IT_STAFF`, `ADMINISTRATOR` | No | Requester provided update or staff resumes work. |
| `WAITING_FOR_REQUESTER`| `RESOLVED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Requires non-empty `resolutionSummary` (min 5 chars). |
| `WAITING_FOR_REQUESTER`| `CANCELLED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Requires confirmation. |
| `RESOLVED` | `CLOSED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Final sign-off. Ticket becomes terminal. |
| `RESOLVED` | `REOPENED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Resolution failed or problem recurred. Requires reopening reason. |
| `REOPENED` | `IN_PROGRESS` | `IT_STAFF`, `ADMINISTRATOR` | No | Active investigation resumed. |
| `REOPENED` | `RESOLVED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Requires updated `resolutionSummary`. |
| `REOPENED` | `CANCELLED` | `IT_STAFF`, `ADMINISTRATOR` | **Yes (Modal)** | Requires confirmation. |
| `CLOSED` | None (Terminal) | None | N/A | No further transitions permitted. |
| `CANCELLED` | None (Terminal) | None | N/A | No further transitions permitted. |

- *Special Requester Indicator:* When a ticket is in `IN_PROGRESS` or `WAITING_FOR_REQUESTER`, the ticket Requester can click "Problem Appears Resolved". This action sets `requesterResolvedIndicator = true` on the ticket. It does **not** change the formal status to `RESOLVED` or `CLOSED`, but provides an alert to IT Staff to verify and perform formal resolution.

- **BR-14 (Comment and Note Immutability):** Public Comments and Internal Notes are append-only. No editing or deletion is supported in Lab 3.
- **BR-15 (Comment and Note Content Rules):** Comment and note content must be trimmed, non-empty, with minimum length 1 character and maximum length 2,000 characters. Author identity and timestamp must be assigned by the server.

### Administrator Operations & Safety Rules
- **BR-16 (Single Role Enforcement):** Each user must be assigned exactly one permitted role: `REQUESTER`, `IT_STAFF`, or `ADMINISTRATOR`.
- **BR-17 (Unique Email Constraint):** User email addresses must be unique across the entire system (case-insensitive comparison).
- **BR-18 (Self-Deactivation Prevention):** An Administrator cannot deactivate their own account.
- **BR-19 (Last Active Admin Protection):** The system must reject any operation that deactivates, alters the role of, or removes the last remaining active Administrator in the system.
- **BR-20 (No User Deletion):** User records cannot be deleted. Disabling access must be performed exclusively via setting `isActive = false` (account deactivation).
- **BR-21 (Role Separation of Duties):** Administrators manage user accounts; IT Staff manage tickets. Administrators may perform ticket operations only if explicitly given staff privileges or assigned as owner, maintaining clear conceptual separation.

---

## 6. UI Specification Summary

The TokTickIT Lab 3 user interface strictly follows the Zen Green design system:
- **Design Tokens:** `--color-primary: #006B3C`, `--color-secondary: #0B7A46`, `--color-pale: #EAF6EF`, `--color-bg: #F5F7F6`, `--color-surface: #FFFFFF`, `--color-text: #1F2A24`.
- **Header / App Shell:** Displays logo, user full name, role badge (`Requester`, `IT Staff`, `Admin`), role-specific navigation tabs, and a "Sign Out" button.
- **Login Screen:** Clean centered card on `--color-bg`, input fields for Email and Password, "Sign In" button with loading spinner, and safe generic failure alerts ("Invalid email or password" / "Account is inactive").
- **Mandatory Password Change Screen:** Accessible only when user is flagged. Form fields for Current Password, New Password, and Confirm Password with live validation against security rules.
- **IT Staff Ticket Queue:** Professional data table featuring Ticket No, Created Date, Summary, Category, Requested Priority badge, IT Priority badge, Status badge, Ticket Owner, and "View" action. Includes filter bar (search, category, status, priority, owner), sorting headers, pagination bar, and clear Empty/No-results states.
- **IT Staff Ticket Detail:** Clear split layout: Read-only ticket details, operational editing card (Owner dropdown, IT Priority dropdown, Status transition select/buttons), Attachments viewer, and distinct communication sections:
  - **Public Comments:** Zen Green styling with author name, role badge, timestamp, and append comment form.
  - **Internal Notes:** High-contrast amber/gold border and warning header ("CONFIDENTIAL — Visible to IT Staff & Admin Only") to prevent accidental leakage.
- **Administrator User Management:** Streamlined user table (Name, Email, Role badge, Status badge, Edit button), top filter/search toolbar, and a slide-over/modal drawer for Create User, Edit User, and Reset Initial Password with confirmation prompts.
- *Refer to [ui-spec.md](./ui-spec.md) for complete visual tokens, layout grids, and responsive breakpoints.*

---

## 7. Data Changes

### 7.1. Prisma Schema Evolution
The schema evolves from Lab 2 without dropping existing tables or data:
- **`User` Model:** Replaces and absorbs `RequesterUser`:
  - `id` (Int, Autoincrement, Primary Key)
  - `name` (String)
  - `email` (String, Unique, Indexed)
  - `passwordHash` (String)
  - `role` (Enum `UserRole`: `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`)
  - `isActive` (Boolean, Default `true`)
  - `mustChangePassword` (Boolean, Default `true` for newly created or reset users)
  - `createdAt` (DateTime, Default `now()`)
  - `updatedAt` (DateTime, UpdatedAt)
- **`Ticket` Model:**
  - Foreign key `requesterId` references `User(id)`
  - New Foreign key `ticketOwnerId` (Int, Optional) references `User(id)`
  - New column `itPriority` (Enum `Priority`, Default matches `requestedPriority`)
  - Status column updated to full 8-status enum: `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`
  - New column `requesterResolvedIndicator` (Boolean, Default `false`)
- **`PublicComment` Model:**
  - `id` (Int, Autoincrement, Primary Key)
  - `ticketId` (Int, References `Ticket(id)`, Indexed)
  - `authorId` (Int, References `User(id)`)
  - `content` (String, Max 2000 chars)
  - `createdAt` (DateTime, Default `now()`)
- **`InternalNote` Model:**
  - `id` (Int, Autoincrement, Primary Key)
  - `ticketId` (Int, References `Ticket(id)`, Indexed)
  - `authorId` (Int, References `User(id)`)
  - `content` (String, Max 2000 chars)
  - `createdAt` (DateTime, Default `now()`)

### 7.2. Data Migration Strategy
1. Add new columns and tables via Prisma Migrate.
2. Transfer records from `RequesterUser` into `User` with role `REQUESTER`. Every migrated user account receives a known secure initial password (`InitialPassword123!`) and **strictly has `mustChangePassword = true`** in full adherence to BR-02 and BR-09 (and the Part 5 grading criterion).
3. Test suites and E2E fixtures use documented helper utilities that execute the mandatory password change flow upon authentication or utilize predefined test fixtures to verify both first-login behavior and post-change flows.
4. Update `Ticket.requesterId` foreign key to point to `User.id`, preserving 100% of historical ticket and attachment ownership.

### 7.3. Idempotent Seed Data
The seed script will populate:
- **Requesters:** 4 active accounts (e.g., `jennifer.anderson@toktickit.com`, `david.lee@toktickit.com`, `sarah.johnson@toktickit.com`, `emily.davis@toktickit.com`) and 1 inactive account (`robert.wilson@toktickit.com`).
- **IT Staff:** 3 active accounts (e.g., `michael.brown@toktickit.com`, `alex.thompson@toktickit.com`, `lisa.martinez@toktickit.com`) and 1 inactive account (`kevin.patel@toktickit.com`).
- **Administrator:** 1 active account (`john.smith@toktickit.com`).
- **Sample Tickets:** Distributed across statuses (`NEW`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, etc.), priorities, and assigned/unassigned states.
- **Comments & Notes:** Sample Public Comments and Internal Notes on selected tickets.

---

## 8. API Contract Summary

- **Authentication Endpoints:**
  - `POST /api/auth/login` — Authenticate and receive session cookie.
  - `POST /api/auth/logout` — Clear session cookie.
  - `GET /api/auth/me` — Get current user information.
  - `POST /api/auth/change-password` — Change password and clear `mustChangePassword`.
- **Requester Continuation Endpoints (Protected by Auth):**
  - `GET /api/tickets` — Retrieve tickets owned by logged-in Requester.
  - `POST /api/tickets` — Create ticket owned by logged-in Requester.
  - `GET /api/tickets/:id` — Retrieve owned ticket details.
  - `POST /api/tickets/:id/attachments` — Upload attachment to owned ticket.
  - `DELETE /api/attachments/:id` — Soft-remove owned attachment.
  - `PATCH /api/tickets/:id/resolve-indicator` — Flag problem as appears resolved (FR-13).
  - `PATCH /api/tickets/:id/cancel` — Cancel owned ticket while still in `NEW` status (FR-13.1).
- **IT Staff Queue & Operations Endpoints:**
  - `GET /api/staff/tickets` — Query all tickets with search, filters, sorting, and pagination.
  - `GET /api/staff/tickets/:id` — Get full ticket details for operational processing.
  - `PATCH /api/staff/tickets/:id/owner` — Claim or reassign ticket owner.
  - `PATCH /api/staff/tickets/:id/priority` — Update IT Priority.
  - `PATCH /api/staff/tickets/:id/status` — Update ticket status according to transition rules (with required confirmations).
- **Public Comments & Internal Notes Endpoints:**
  - `GET /api/tickets/:id/comments` — Get Public Comments (Requester, Staff, Admin).
  - `POST /api/tickets/:id/comments` — Add Public Comment.
  - `GET /api/tickets/:id/notes` — Get Internal Notes (Staff, Admin only).
  - `POST /api/tickets/:id/notes` — Add Internal Note (Staff, Admin only).
- **Administrator User Management Endpoints:**
  - `GET /api/admin/users` — List users with search and role filter (FR-22).
  - `POST /api/admin/users` — Create user with initial password.
  - `PATCH /api/admin/users/:id` — Update user details or activation state (FR-24).
  - `POST /api/admin/users/:id/reset-password` — Issue new initial password.
- *Refer to [api-spec.md](./api-spec.md) for full request/response schemas, error structures, and HTTP status codes.*

---

## 9. Acceptance Criteria

- **AC-01 (Valid Login):** Given an active user with valid email and password, when logging in via `POST /api/auth/login`, then the backend returns `200 OK`, sets an HTTP-only authentication cookie, and returns safe user data (id, name, email, role, mustChangePassword).
- **AC-02 (Mandatory Password Change):** Given a user with `mustChangePassword = true`, when accessing the application, then all standard application routes/APIs return `403 Forbidden` (or redirect to Change Password), and the user can only execute `POST /api/auth/change-password` until a valid password conforming to BR-07 is saved.
- **AC-03 (Requester Identity Isolation):** Given an authenticated Requester, when calling `GET /api/tickets` or supplying another requester's ID in request headers/body, then the backend strictly binds queries to the authenticated session (`req.user.id`) and never returns or alters another user's tickets.
- **AC-04 (Internal Notes Authorization):** Given a Requester account, when attempting to call `GET /api/tickets/:id/notes` or `POST /api/tickets/:id/notes`, then the request is rejected with `403 Forbidden` and no note data or existence is exposed.
- **AC-05 (Staff Ticket Queue Retrieval):** Given an active IT Staff user, when requesting `GET /api/staff/tickets` with search, filter, sort, or pagination parameters, then the backend returns the matching paginated tickets across all requesters with complete metadata (`totalCount`, `page`, `pageSize`, `totalPages`).
- **AC-06 (Ticket Ownership Assignment):** Given an active IT Staff or Administrator, when claiming or reassigning a ticket via `PATCH /api/staff/tickets/:id/owner` to an active staff user, then the ticket owner is updated and reflected in subsequent queue and detail queries.
- **AC-07 (IT Priority Update):** Given an IT Staff user, when updating a ticket's IT Priority via `PATCH /api/staff/tickets/:id/priority`, then the new priority is saved without altering the original Requester's `requestedPriority`.
- **AC-08 (Permitted Status Transitions):** Given a ticket in `OPEN` status, when IT Staff requests transition to `IN_PROGRESS`, the transition succeeds with `200 OK`; when attempting an invalid transition (e.g. directly from `NEW` to `RESOLVED`), the request is rejected with `400 Bad Request` and an explanatory error message.
- **AC-09 (Public Comment Thread):** Given an authenticated ticket Requester or IT Staff, when posting a valid comment via `POST /api/tickets/:id/comments`, then the comment is persisted with author details and timestamp, and is retrievable by both Requester and IT Staff.
- **AC-10 (Admin User Creation):** Given an Administrator, when creating a user via `POST /api/admin/users` with valid details and initial password, then the user is created with `mustChangePassword = true` and can authenticate.
- **AC-11 (Admin Safety - Duplicate Email):** Given an existing user email, when an Administrator attempts to create or update another user with the same email, then the request is rejected with `409 Conflict`.
- **AC-12 (Admin Safety - Self-Deactivation):** Given an authenticated Administrator, when attempting to deactivate their own account via `PATCH /api/admin/users/:id`, then the request is rejected with `400 Bad Request` citing self-deactivation prevention (BR-18).
- **AC-13 (Admin Safety - Last Admin Protection):** Given a system with only one active Administrator, when attempting to deactivate or demote that Administrator's role, then the request is rejected with `400 Bad Request` citing last active administrator protection (BR-19).
- **AC-14 (Non-Admin Access to Admin APIs):** Given an IT Staff or Requester user, when attempting to access any `/api/admin/*` endpoint, then the server returns `403 Forbidden`.
- **AC-15 (Requester Problem Appears Resolved Indicator):** Given an authenticated Requester, when calling `PATCH /api/tickets/:id/resolve-indicator` on an owned ticket in `IN_PROGRESS` or `WAITING_FOR_REQUESTER`, then `requesterResolvedIndicator` is set to `true` and returned in ticket details, while formal ticket status remains unchanged.
- **AC-16 (Admin User Search & Filter):** Given an Administrator, when requesting `GET /api/admin/users` with a search term (matching name or email) and/or an optional role query parameter, then only matching user records are returned.
- **AC-17 (Admin User Update):** Given an Administrator, when calling `PATCH /api/admin/users/:id` with updated user name, email, role, or active status, then valid updates are saved while violating operations (e.g. duplicate email, self-deactivation) are rejected.

---

## 10. Product Definition of Done (DoD)

Before the Lab 3 increment is marked as Complete:
1. **Specification Conformance:** All functional requirements (FR-01..FR-26) and business rules (BR-01..BR-21) are fully implemented and verified against this document, `api-spec.md`, and `ui-spec.md`.
2. **Acceptance Criteria & Test Traceability:** Every Acceptance Criterion (AC-01..AC-17) maps directly to passing automated tests documented in `tests.md`.
3. **Automated Test Coverage:**
   - All server API tests in `server/tests/lab-03/` pass (`auth.api.test.ts`, `authorization.api.test.ts`, `staff-queue.api.test.ts`, `staff-ticket-detail.api.test.ts`, `comments-notes.api.test.ts`, `users-admin.api.test.ts`).
   - All client component tests in `client/src/.../` pass (`Login.test.tsx`, `ChangePassword.test.tsx`, `StaffTicketQueue.test.tsx`, `StaffTicketDetail.test.tsx`, `UserManagement.test.tsx`).
   - All Playwright E2E tests in `e2e/lab-03/` pass (`authentication.spec.ts`, `staff-ticket-flow.spec.ts`, `user-administration.spec.ts`).
   - No tests are skipped, bypassed, or mocked at the HTTP layer in E2E suites.
4. **Data Integrity & Migration:** Existing Lab 2 Categories, Related Systems, Tickets, and Attachments remain intact and operational. Seed scripts execute idempotently.
5. **Zen Green UI Fidelity:** All new screens conform strictly to the Zen Green color palette, accessible typography, distinct editable/read-only styling, clear distinction between Public Comments and Internal Notes, and responsive layout across desktop (1280px), tablet (768px), and mobile (375px).
6. **Repository & Submission Integrity:**
   - Commit history demonstrates staged feature PRs merged into `lab3-staging` and finally into `main`.
   - All GitHub Issues are closed in Done state on the project Kanban board.
   - `docs/lab-03/reviewer.md` and `docs/lab-03/ai-use.md` are completed.
   - Screenshot artifacts are saved under `artifacts/lab-03/screenshots/`.

---

## 11. Assumptions and Decisions

1. **Authentication Token & CSRF Protection Strategy:** Authentication uses JSON Web Tokens (JWT) stored in secure, `HttpOnly`, `SameSite=Lax` cookies to prevent client-side JavaScript (XSS) access. Under the `SameSite=Lax` browser standard, cookies are automatically omitted on cross-site mutating requests (such as POST, PUT, PATCH, DELETE initiated from third-party origins). In addition, all mutating API endpoints require `Content-Type: application/json` and enforce validation of custom request headers (`X-Requested-With: XMLHttpRequest`), which modern browsers never send cross-origin without CORS preflight clearance. This combination provides robust CSRF defense suitable for a same-origin React/Express stack without introducing the overhead and complexity of separate synchronizer token stores.
2. **Requester Resolution Indication:** The stakeholder request states Requesters may indicate a problem appears resolved without formally closing it. We implement this via a boolean flag `requesterResolvedIndicator` on the Ticket model and a distinct UI badge ("Requester Marked as Resolved") visible to IT Staff, allowing IT Staff to inspect and formally advance status to `RESOLVED` or `CLOSED`.
3. **Internal Note Security & Safe Errors:** To prevent leaking the existence of tickets or internal notes to unauthorized callers, attempting to fetch notes on a nonexistent ticket or an unowned ticket returns a uniform `404 Not Found` or `403 Forbidden` response that does not reveal metadata.
4. **Live Session Re-Verification (PR #50 review):** `requireAuth` re-reads `isActive`, `role`, and `mustChangePassword` from the database on every request rather than trusting the (up to 8h-old) JWT claims. This means only an Administrator who is *themselves* still active can reach `/api/admin/*` — so BR-19's last-active-admin protection can only ever be triggered by the sole remaining active Administrator acting on their own account (self-demotion, since self-deactivation is already unconditionally blocked by BR-18). A third party can never be the one who reduces the active-admin count to zero, because a third party who is still active is, by definition, not the last one.
