# Lab 3 Test Plan and Traceability Matrix

Status: Planned (Issue 1 — Spec-DD / Test-DD). No implementation code has been written yet. Every test case below is planned prior to implementation so that subsequent feature issues write failing tests first (TDD) against this contract. All test results are marked as `Planned` initially and will be updated to `Pass` progressively as each feature lands and is verified.

---

## 1. Test Strategy & Architecture

TokTickIT employs an 8-category test strategy in strict compliance with the Lab 3 engineering guidelines (§10):
1. **Unit Tests (Vitest):** Pure business logic, state transition matrix validation, password complexity validator, query parameter sanitizers.
2. **API / Integration Tests (Supertest + PostgreSQL):** Automated endpoint tests running against a dedicated test database (migrated and seeded), verifying authentication, cookie management, role authorization matrix, input validation, and safe error responses.
3. **UI Component Tests (Vitest + React Testing Library):** Component rendering, form input validation, loading and busy states, role badge styling, and safe error presentation in isolation.
4. **UI Style Tests (Vitest / Playwright):** Assertions on Zen Green CSS variables, status/priority/role badge classes, warm ivory read-only field styling, and high-contrast amber/gold styling for internal notes.
5. **Responsive Tests (Playwright Viewports):** Assertions on zero body horizontal overflow (`scrollWidth === innerWidth`), mobile card transformation, and layout integrity across Desktop (1280px), Tablet (768px), and Mobile (375px).
6. **Security & Authorization Tests:** Server-side role-based access control (RBAC) verification ensuring Requesters cannot access staff queues, notes, or admin APIs, and non-admins cannot mutate user accounts.
7. **Migration & Regression Tests:** Database migration integrity checks ensuring existing Lab 2 tickets/attachments are preserved, migrated users receive mandatory initial password change flags, and Lab 2 requester flows continue working seamlessly under authenticated identity.
8. **End-to-End Tests (Playwright):** Full-stack browser journeys covering authentication, first-login password change, IT Staff queue triage, ticket lifecycle workflows, and administrator user management.

---

## 2. Planned Tests Matrix

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| **UNIT-01** | Unit | BR-07, AC-02 | Password complexity validator | Rejects passwords missing uppercase, lowercase, numbers, or symbols; accepts compliant passwords | `server/tests/lab-03/auth.unit.test.ts` | Planned |
| **UNIT-02** | Unit | BR-13, AC-08 | Status transition state machine | Permits valid transitions (e.g. `OPEN` → `IN_PROGRESS`); rejects invalid transitions (e.g. `NEW` → `CLOSED`) | `server/tests/lab-03/workflow.unit.test.ts` | Planned |
| **UNIT-03** | Unit | FR-15, AC-05 | Queue query normalizer & parser | Falls back safely on invalid sort fields, negative pages, or oversized page sizes | `server/tests/lab-03/queue-query.unit.test.ts` | Planned |
| **API-01** | API | AC-01, FR-01 | Valid user login | 200 OK; sets `toktickit_session` HTTP-only cookie; returns user profile without password hash | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **API-02** | API | BR-01 | Login with invalid password | 401 Unauthorized; generic error message; no session cookie set | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **API-03** | API | BR-01 | Login with inactive user account | 401 Unauthorized; safe error message; login blocked | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **API-04** | API | FR-05 | User logout | 200 OK; clears `toktickit_session` cookie | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **API-05** | API | FR-06 | Current user retrieval (`GET /api/auth/me`) | 200 OK; returns authenticated user profile and role | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **API-06** | API | AC-02, BR-02 | User with `mustChangePassword=true` accessing protected app endpoints | 403 Forbidden (`PASSWORD_CHANGE_REQUIRED`); access blocked until password is changed | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **API-07** | API | AC-02, FR-04 | Successful password change (`POST /api/auth/change-password`) | 200 OK; updates password hash; sets `mustChangePassword=false`; clears barrier | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **API-08** | API | AC-04, BR-05 | Requester requests Internal Notes (`GET /api/tickets/:id/notes`) | 403 Forbidden; no note data or existence exposed | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **API-09** | API | AC-04, BR-05 | Requester creates Internal Note (`POST /api/tickets/:id/notes`) | 403 Forbidden; note creation rejected | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **API-10** | API | AC-03, BR-03 | Requester ticket isolation on `GET /api/tickets` | Returns only tickets where `requesterId == req.user.id`; ignores client-supplied query id | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| **API-11** | API | AC-03, BR-03 | Requester accessing another user's ticket detail (`GET /api/tickets/:id`) | 404 Not Found (safe error, no information leakage) | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| **API-12** | API | AC-05, FR-14 | IT Staff retrieves ticket queue (`GET /api/staff/tickets`) | 200 OK; returns tickets across all requesters with pagination metadata | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| **API-13** | API | AC-05, FR-15 | IT Staff queue search by Ticket Number or Summary | 200 OK; returns only matching tickets | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| **API-14** | API | AC-05, FR-15 | IT Staff queue filter by status, priority, category, owner | 200 OK; returns filtered results | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| **API-15** | API | AC-05 | Requester attempts to access staff queue (`GET /api/staff/tickets`) | 403 Forbidden; access denied | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| **API-16** | API | AC-06, FR-16 | IT Staff claims unassigned ticket (`PATCH /api/staff/tickets/:id/owner`) | 200 OK; assigns acting user as ticket owner | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **API-17** | API | AC-06, FR-16 | IT Staff reassigns ticket to another active staff member | 200 OK; owner updated to new staff user | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **API-18** | API | AC-06 | Assigning ticket owner to a Requester user | 400 Bad Request; target user must have role `IT_STAFF` or `ADMINISTRATOR` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **API-19** | API | AC-07, FR-17 | IT Staff updates IT Priority (`PATCH /api/staff/tickets/:id/priority`) | 200 OK; `itPriority` updated; original `requestedPriority` remains unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **API-20** | API | AC-08, FR-18 | IT Staff updates ticket status to valid next status (`OPEN` → `IN_PROGRESS`) | 200 OK; status updated | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **API-21** | API | AC-08 | IT Staff attempts invalid status jump (`NEW` → `RESOLVED`) | 400 Bad Request; transition rejected | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **API-22** | API | AC-09, FR-20 | Posting Public Comment as IT Staff / Requester | 201 Created; comment saved with author details | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **API-23** | API | BR-15 | Posting empty or whitespace comment | 400 Bad Request; comment rejected | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **API-24** | API | FR-19 | Posting Internal Note as IT Staff | 201 Created; note saved with author details | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **API-25** | API | AC-14 | Requester or IT Staff accessing Admin user list (`GET /api/admin/users`) | 403 Forbidden; access denied | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **API-26** | API | AC-10, FR-23 | Administrator creates new user (`POST /api/admin/users`) | 201 Created; user saved with `mustChangePassword=true` and specified role | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **API-27** | API | AC-11, BR-17 | Administrator creates user with duplicate email | 409 Conflict; duplicate email rejected | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **API-28** | API | AC-12, BR-18 | Administrator deactivates own account (`PATCH /api/admin/users/:id`) | 400 Bad Request; self-deactivation rejected | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **API-29** | API | AC-13, BR-19 | Administrator deactivates last remaining active Administrator | 400 Bad Request; last admin protection triggered | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **API-30** | API | FR-25, BR-09 | Administrator resets user password (`POST /api/admin/users/:id/reset-password`) | 200 OK; password updated; `mustChangePassword` set to true | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **API-31** | API | AC-15, FR-13 | Requester marks ticket as appears resolved (`PATCH /api/tickets/:id/resolve-indicator`) | 200 OK; flag set to true; status remains unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **API-32** | API | AC-16, FR-22 | Administrator searches users by name/email and filters by role (`GET /api/admin/users`) | 200 OK; returns only matching users | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **API-33** | API | AC-17, FR-24 | Administrator updates user name, email, role, and active status (`PATCH /api/admin/users/:id`) | 200 OK; changes persisted | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **API-34** | API | FR-13.1, BR-13| Requester cancels owned ticket while in `NEW` status (`PATCH /api/tickets/:id/cancel`) | 200 OK; status updated to `CANCELLED`; rejected if ticket is already in progress | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| **MIGR-01** | Migration | §5.1, §5.2 | Database migration from Lab 2 schema to Lab 3 User model | Lab 2 RequesterUser rows migrated to User; ticket & attachment foreign keys intact | `server/tests/lab-03/migration.test.ts` | Pass |
| **MIGR-02** | Migration | BR-02, BR-09 | Migrated Requester authenticates with initial password | 200 OK; `mustChangePassword=true` returned; app access blocked until password changed | `server/tests/lab-03/migration.test.ts` | Pass |
| **REGR-01** | Regression| FR-10, FR-11 | Lab 2 Requester flows (Create, My Tickets, Detail, Attachments) under real auth | Full ticket creation, listing, attachment upload/download/soft-delete functions pass | `server/tests/lab-03/requester-regression.test.ts` | Planned |
| **UI-01** | Component | AC-01 | Login form validation, busy state spinner, and safe error rendering | Renders email/password errors; displays spinner when in flight | `client/tests/lab-03/Login.test.tsx` | Planned |
| **UI-02** | Component | AC-02 | Change Password form rules checklist and validation | Checks mark active as rules are satisfied; confirms match | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |
| **UI-03** | Component | FR-08, FR-09 | App shell renders user name, role badge, and role-permitted navigation | Shows Staff navigation for staff, Admin navigation for admin | `client/tests/lab-03/AppShell.test.tsx` | Planned |
| **UI-04** | Component | AC-05, FR-15 | Staff Ticket Queue table, filter controls, pagination, and sorting | Correctly handles filter changes, sort toggles, and empty/no-results states | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| **UI-05** | Component | AC-06, AC-07 | Staff Ticket Detail operational controls (Owner, IT Priority, Status) | Shows only permitted status transitions; updates priority and owner | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| **UI-06** | Component | BR-04, BR-05 | Public Comments vs. Internal Notes visual styling distinction | Internal Notes render with distinct warning amber border and lock banner | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| **UI-07** | Component | AC-10, AC-12 | Admin User Management user list, create modal, and self-deactivation guard | Self-deactivate toggle is disabled for logged-in admin | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| **STYLE-01**| UI Style | §7, §8 | Zen Green tokens, badge classes, read-only field fill, and amber internal notes styling | Elements have correct CSS tokens, warm ivory `#F1F0E8` for read-only, amber border for notes | `client/tests/lab-03/Styles.test.tsx` | Planned |
| **RESP-01** | Responsive| §6, §8 | Desktop viewport (≥992px) layout integrity across all screens | Full table view, side-by-side panels, zero horizontal body scroll | `e2e/lab-03/responsive.spec.ts` | Planned |
| **RESP-02** | Responsive| §6, §8 | Tablet viewport (768–991px) layout integrity across all screens | Two-column flow, collapsible drawers, zero horizontal body scroll | `e2e/lab-03/responsive.spec.ts` | Planned |
| **RESP-03** | Responsive| §6, §8 | Mobile viewport (<768px) layout integrity and card transformation | Queue table converts to stacked cards, full-width touch inputs, zero horizontal body scroll | `e2e/lab-03/responsive.spec.ts` | Planned |
| **E2E-01** | E2E | AC-01 | End-to-end user login, session persistence, and logout journey | User logs in, sees appropriate shell and tickets, logs out, redirected to login | `e2e/lab-03/authentication.spec.ts` | Planned |
| **E2E-02** | E2E | AC-02 | Initial password login and mandatory password change journey | User with initial password is forced to change password before entering app | `e2e/lab-03/authentication.spec.ts` | Planned |
| **E2E-03** | E2E | AC-05, AC-06 | IT Staff end-to-end triage: queue search, claim ticket, update priority and status | Ticket is claimed, priority changed to High, status moved to In Progress | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| **E2E-04** | E2E | AC-04, AC-09 | Communication flow: Requester posts public comment, Staff responds publicly and adds internal note | Requester sees public comment but does NOT see internal note | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| **E2E-05** | E2E | AC-10, AC-12 | Administrator user lifecycle: create user, edit, reset password, verify safety guardrails | New user created, password reset, self-deactivation blocked | `e2e/lab-03/user-administration.spec.ts` | Planned |

---

## 3. Acceptance Criteria Traceability

| Acceptance Criteria | Mapped Automated Tests | Final Status |
|---|---|---|
| **AC-01** (Valid Login & Session) | `API-01`, `UI-01`, `E2E-01` | Planned |
| **AC-02** (Mandatory Password Change) | `UNIT-01`, `API-06`, `API-07`, `UI-02`, `E2E-02` | Planned |
| **AC-03** (Requester Identity Isolation) | `API-10`, `API-11`, `REGR-01` | Planned |
| **AC-04** (Internal Notes Authorization) | `API-08`, `API-09`, `E2E-04` | Planned |
| **AC-05** (Staff Ticket Queue Retrieval) | `UNIT-03`, `API-12`, `API-13`, `API-14`, `API-15`, `UI-04`, `E2E-03` | Planned |
| **AC-06** (Ticket Ownership Assignment) | `API-16`, `API-17`, `API-18`, `UI-05`, `E2E-03` | Planned |
| **AC-07** (IT Priority Update) | `API-19`, `UI-05`, `E2E-03` | Planned |
| **AC-08** (Permitted Status Transitions) | `UNIT-02`, `API-20`, `API-21`, `UI-05`, `E2E-03` | Planned |
| **AC-09** (Public Comments Thread) | `API-22`, `API-23`, `UI-06`, `E2E-04` | Planned |
| **AC-10** (Admin User Creation) | `API-26`, `UI-07`, `E2E-05` | Planned |
| **AC-11** (Admin Safety: Duplicate Email) | `API-27` | Planned |
| **AC-12** (Admin Safety: Self-Deactivation) | `API-28`, `UI-07`, `E2E-05` | Planned |
| **AC-13** (Admin Safety: Last Admin Protection) | `API-29` | Planned |
| **AC-14** (Admin API Authorization) | `API-25` | Planned |
| **AC-15** (Problem Appears Resolved Indicator) | `API-31`, `UI-05` | Planned |
| **AC-16** (Admin User Search & Filter) | `API-32`, `UI-07` | Planned |
| **AC-17** (Admin User Update) | `API-33`, `UI-07` | Planned |
