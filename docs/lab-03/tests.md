# Lab 3 Test Plan and Traceability Matrix

Status: Planned (Issue 1 — Spec-DD / Test-DD). No implementation code has been written yet. Every test case below is planned prior to implementation so that subsequent feature issues write failing tests first (TDD) against this contract. Results are marked as `Planned` initially and updated to `Pass` upon feature verification.

---

## 1. Test Strategy & Architecture

TokTickIT employs a multi-tiered test strategy covering all layers of the application:
1. **Unit Tests (Vitest):** Pure business logic, state transition matrix validation, password complexity validator, query parameter sanitizers.
2. **API / Integration Tests (Supertest + PostgreSQL):** Automated endpoint tests running against a dedicated test database (migrated and seeded), verifying authentication, cookie management, role authorization matrix, input validation, and safe error responses.
3. **UI Component Tests (Vitest + React Testing Library):** Component rendering, form input validation, loading and busy states, role badge styling, and safe error presentation in isolation.
4. **End-to-End Tests (Playwright):** Full-stack browser journeys covering authentication, password change enforcement, IT Staff queue triage, ticket lifecycle workflows, and administrator user management.
5. **Security & Authorization Tests:** Cross-role permission checks ensuring that Requesters cannot access staff queues, notes, or admin APIs, and that non-admins cannot mutate user accounts.
6. **Regression Tests:** Ensuring that existing Lab 2 Requester capabilities (Create Ticket, My Tickets, Ticket Detail, Attachments) continue to operate seamlessly with real authenticated sessions.

---

## 2. Planned Tests Matrix

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| **UNIT-01** | Unit | BR-07, AC-02 | Password complexity validator | Rejects passwords missing uppercase, lowercase, numbers, or symbols; accepts compliant passwords | `server/tests/lab-03/auth.unit.test.ts` | Pass |
| **UNIT-02** | Unit | BR-13, AC-08 | Status transition state machine | Permits valid transitions (e.g. `OPEN` → `IN_PROGRESS`); rejects invalid transitions (e.g. `NEW` → `CLOSED`) | `server/tests/lab-03/workflow.unit.test.ts` | Pass |
| **UNIT-03** | Unit | FR-15, AC-05 | Queue query normalizer & parser | Falls back safely on invalid sort fields, negative pages, or oversized page sizes | `server/tests/lab-03/queue-query.unit.test.ts` | Pass |
| **API-01** | API | AC-01, FR-01 | Valid user login | 200 OK; sets `toktickit_session` HTTP-only cookie; returns user profile without password hash | `server/tests/lab-03/auth.api.test.ts` | Pass |
| **API-02** | API | BR-01 | Login with invalid password | 401 Unauthorized; generic error message; no session cookie set | `server/tests/lab-03/auth.api.test.ts` | Pass |
| **API-03** | API | BR-01 | Login with inactive user account | 401 Unauthorized; safe error message; login blocked | `server/tests/lab-03/auth.api.test.ts` | Pass |
| **API-04** | API | FR-05 | User logout | 200 OK; clears `toktickit_session` cookie | `server/tests/lab-03/auth.api.test.ts` | Pass |
| **API-05** | API | FR-06 | Current user retrieval (`GET /api/auth/me`) | 200 OK; returns authenticated user profile and role | `server/tests/lab-03/auth.api.test.ts` | Pass |
| **API-06** | API | AC-02, BR-02 | User with `mustChangePassword=true` accessing protected app endpoints | 403 Forbidden (`PASSWORD_CHANGE_REQUIRED`); access blocked until password is changed | `server/tests/lab-03/auth.api.test.ts` | Pass |
| **API-07** | API | AC-02, FR-04 | Successful password change (`POST /api/auth/change-password`) | 200 OK; updates password hash; sets `mustChangePassword=false`; clears barrier | `server/tests/lab-03/auth.api.test.ts` | Pass |
| **API-08** | API | AC-04, BR-05 | Requester requests Internal Notes (`GET /api/tickets/:id/notes`) | 403 Forbidden; no note data or existence exposed | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| **API-09** | API | AC-04, BR-05 | Requester creates Internal Note (`POST /api/tickets/:id/notes`) | 403 Forbidden; note creation rejected | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| **API-10** | API | AC-03, BR-03 | Requester ticket isolation on `GET /api/tickets` | Returns only tickets where `requesterId == req.user.id`; ignores client-supplied query id | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| **API-11** | API | AC-03, BR-03 | Requester accessing another user's ticket detail (`GET /api/tickets/:id`) | 404 Not Found (safe error, no information leakage) | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| **API-12** | API | AC-05, FR-14 | IT Staff retrieves ticket queue (`GET /api/staff/tickets`) | 200 OK; returns tickets across all requesters with pagination metadata | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| **API-13** | API | AC-05, FR-15 | IT Staff queue search by Ticket Number or Summary | 200 OK; returns only matching tickets | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| **API-14** | API | AC-05, FR-15 | IT Staff queue filter by status, priority, category, owner | 200 OK; returns filtered results | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| **API-15** | API | AC-05 | Requester attempts to access staff queue (`GET /api/staff/tickets`) | 403 Forbidden; access denied | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| **API-16** | API | AC-06, FR-16 | IT Staff claims unassigned ticket (`PATCH /api/staff/tickets/:id/owner`) | 200 OK; assigns acting user as ticket owner | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| **API-17** | API | AC-06, FR-16 | IT Staff reassigns ticket to another active staff member | 200 OK; owner updated to new staff user | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| **API-18** | API | AC-06 | Assigning ticket owner to a Requester user | 400 Bad Request; target user must have role `IT_STAFF` or `ADMINISTRATOR` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| **API-19** | API | AC-07, FR-17 | IT Staff updates IT Priority (`PATCH /api/staff/tickets/:id/priority`) | 200 OK; `itPriority` updated; original `requestedPriority` remains unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| **API-20** | API | AC-08, FR-18 | IT Staff updates ticket status to valid next status (`OPEN` → `IN_PROGRESS`) | 200 OK; status updated | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| **API-21** | API | AC-08 | IT Staff attempts invalid status jump (`NEW` → `RESOLVED`) | 400 Bad Request; transition rejected | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| **API-22** | API | AC-09, FR-20 | Posting Public Comment as IT Staff / Requester | 201 Created; comment saved with author details | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| **API-23** | API | BR-15 | Posting empty or whitespace comment | 400 Bad Request; comment rejected | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| **API-24** | API | FR-19 | Posting Internal Note as IT Staff | 201 Created; note saved with author details | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| **API-25** | API | AC-14 | Requester or IT Staff accessing Admin user list (`GET /api/admin/users`) | 403 Forbidden; access denied | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-26** | API | AC-10, FR-23 | Administrator creates new user (`POST /api/admin/users`) | 201 Created; user saved with `mustChangePassword=true` and specified role | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-27** | API | AC-11, BR-17 | Administrator creates user with duplicate email | 409 Conflict; duplicate email rejected | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-28** | API | AC-12, BR-18 | Administrator deactivates own account (`PATCH /api/admin/users/:id`) | 400 Bad Request; self-deactivation rejected | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-29** | API | AC-13, BR-19 | Administrator deactivates last remaining active Administrator | 400 Bad Request; last admin protection triggered | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-30** | API | FR-25, BR-09 | Administrator resets user password (`POST /api/admin/users/:id/reset-password`) | 200 OK; password updated; `mustChangePassword` set to true | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **UI-01** | Component | AC-01 | Login form validation, busy state spinner, and safe error rendering | Renders email/password errors; displays spinner when in flight | `client/tests/lab-03/Login.test.tsx` | Pass |
| **UI-02** | Component | AC-02 | Change Password form rules checklist and validation | Checks mark active as rules are satisfied; confirms match | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| **UI-03** | Component | FR-08, FR-09 | App shell renders user name, role badge, and role-permitted navigation | Shows Staff navigation for staff, Admin navigation for admin | `client/tests/lab-03/AppShell.test.tsx` | Pass |
| **UI-04** | Component | AC-05, FR-15 | Staff Ticket Queue table, filter controls, pagination, and sorting | Correctly handles filter changes, sort toggles, and empty/no-results states | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| **UI-05** | Component | AC-06, AC-07 | Staff Ticket Detail operational controls (Owner, IT Priority, Status) | Shows only permitted status transitions; updates priority and owner | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| **UI-06** | Component | BR-04, BR-05 | Public Comments vs. Internal Notes visual styling distinction | Internal Notes render with distinct warning amber border and lock banner | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| **UI-07** | Component | AC-10, AC-12 | Admin User Management user list, create modal, and self-deactivation guard | Self-deactivate toggle is disabled for logged-in admin | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| **E2E-01** | E2E | AC-01 | End-to-end user login, session persistence, and logout journey | User logs in, sees appropriate shell and tickets, logs out, redirected to login | `e2e/lab-03/authentication.spec.ts` | Pass |
| **E2E-02** | E2E | AC-02 | Initial password login and mandatory password change journey | User with initial password is forced to change password before entering app | `e2e/lab-03/authentication.spec.ts` | Pass |
| **E2E-03** | E2E | AC-05, AC-06 | IT Staff end-to-end triage: queue search, claim ticket, update priority and status | Ticket is claimed, priority changed to High, status moved to In Progress | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| **E2E-04** | E2E | AC-04, AC-09 | Communication flow: Requester posts public comment, Staff responds publicly and adds internal note | Requester sees public comment but does NOT see internal note | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| **E2E-05** | E2E | AC-10, AC-12 | Administrator user lifecycle: create user, edit, reset password, verify safety guardrails | New user created, password reset, self-deactivation blocked | `e2e/lab-03/user-administration.spec.ts` | Pass |

---

## 3. Acceptance Criteria Traceability

| Acceptance Criteria | Mapped Automated Tests | Final Status |
|---|---|---|
| **AC-01** (Valid Login & Session) | `API-01`, `UI-01`, `E2E-01` | Pass |
| **AC-02** (Mandatory Password Change) | `UNIT-01`, `API-06`, `API-07`, `UI-02`, `E2E-02` | Pass |
| **AC-03** (Requester Identity Isolation) | `API-10`, `API-11` | Pass |
| **AC-04** (Internal Notes Authorization) | `API-08`, `API-09`, `E2E-04` | Pass |
| **AC-05** (Staff Ticket Queue Retrieval) | `UNIT-03`, `API-12`, `API-13`, `API-14`, `API-15`, `UI-04`, `E2E-03` | Pass |
| **AC-06** (Ticket Ownership Assignment) | `API-16`, `API-17`, `API-18`, `UI-05`, `E2E-03` | Pass |
| **AC-07** (IT Priority Update) | `API-19`, `UI-05`, `E2E-03` | Pass |
| **AC-08** (Permitted Status Transitions) | `UNIT-02`, `API-20`, `API-21`, `UI-05`, `E2E-03` | Pass |
| **AC-09** (Public Comments Thread) | `API-22`, `API-23`, `UI-06`, `E2E-04` | Pass |
| **AC-10** (Admin User Creation) | `API-26`, `UI-07`, `E2E-05` | Pass |
| **AC-11** (Admin Safety: Duplicate Email) | `API-27` | Pass |
| **AC-12** (Admin Safety: Self-Deactivation) | `API-28`, `UI-07`, `E2E-05` | Pass |
| **AC-13** (Admin Safety: Last Admin Protection) | `API-29` | Pass |
| **AC-14** (Admin API Authorization) | `API-25` | Pass |
