# Lab 3 Test Plan and Traceability Matrix

Status: Complete (Issue 8). Every test case below was planned in Issue 1 (Spec-DD / Test-DD) before implementation, so feature issues wrote failing tests first (TDD) against this contract; statuses moved from `Planned` to `Pass` as each feature landed. Issue 8 implemented the remaining E2E, responsive, and style rows and added the rows marked *(Issue 8)* for defects its visual inspection found. Final run output is in §4.

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
| **API-29** | API | AC-13, BR-19 | Sole active Administrator demotes or deactivates themselves | 400 Bad Request (`LAST_ADMIN_PROTECTION` for role change, `SELF_DEACTIVATION_PROHIBITED` for deactivation); either way, blocked | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-30** | API | FR-25, BR-09 | Administrator resets user password (`POST /api/admin/users/:id/reset-password`) | 200 OK; password updated; `mustChangePassword` set to true | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-31** | API | AC-15, FR-13 | Requester marks ticket as appears resolved (`PATCH /api/tickets/:id/resolve-indicator`) | 200 OK; flag set to true; status remains unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| **API-32** | API | AC-16, FR-22 | Administrator searches users by name/email and filters by role (`GET /api/admin/users`) | 200 OK; returns only matching users | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-33** | API | AC-17, FR-24 | Administrator updates user name, email, role, and active status (`PATCH /api/admin/users/:id`) | 200 OK; changes persisted | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **API-34** | API | FR-13.1, BR-13| Requester cancels owned ticket while in `NEW` status (`PATCH /api/tickets/:id/cancel`) | 200 OK; status updated to `CANCELLED`; rejected if ticket is already in progress | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| **API-35** | API | BR-09, BR-18, BR-19 | Deactivate/reset-password/demote take effect on an already-authenticated session immediately | Next request on the target's existing session cookie is blocked (401), forced into the password-change gate (403), or loses its prior role (403) — not deferred until token expiry (PR #50 review) | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| **MIGR-01** | Migration | §5.1, §5.2 | Database migration from Lab 2 schema to Lab 3 User model | Lab 2 RequesterUser rows migrated to User; ticket & attachment foreign keys intact | `server/tests/lab-03/migration.test.ts` | Pass |
| **MIGR-02** | Migration | BR-02, BR-09 | Migrated Requester authenticates with initial password | 200 OK; `mustChangePassword=true` returned; app access blocked until password changed | `server/tests/lab-03/migration.test.ts` | Pass |
| **REGR-01** | Regression| FR-10, FR-11 | Lab 2 Requester flows (Create, My Tickets, Detail, Attachments) under real auth | Full ticket creation, listing, attachment upload/download/soft-delete functions pass | `server/tests/lab-03/requester-regression.test.ts` | Pass |
| **UI-01** | Component | AC-01 | Login form validation, busy state spinner, and safe error rendering | Renders email/password errors; displays spinner when in flight | `client/tests/lab-03/Login.test.tsx` | Pass |
| **UI-02** | Component | AC-02 | Change Password form rules checklist and validation | Checks mark active as rules are satisfied; confirms match | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| **UI-03** | Component | FR-08, FR-09 | App shell renders user name, role badge, and role-permitted navigation | Shows Staff navigation for staff, Admin navigation for admin | `client/tests/lab-03/AppShell.test.tsx` | Pass |
| **UI-04** | Component | AC-05, FR-15 | Staff Ticket Queue table, filter controls, pagination, and sorting | Correctly handles filter changes, sort toggles, and empty/no-results states | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| **UI-05** | Component | AC-06, AC-07 | Staff Ticket Detail operational controls (Owner, IT Priority, Status) | Shows only permitted status transitions; updates priority and owner | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| **UI-06** | Component | BR-04, BR-05 | Public Comments vs. Internal Notes visual styling distinction | Internal Notes render with distinct warning amber border and lock banner | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| **UI-07** | Component | AC-10, AC-12 | Admin User Management user list, create modal, and self-deactivation guard | Self-deactivate toggle is disabled for logged-in admin | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| **UI-16** *(Issue 8)* | Component | FR-08, FR-09, AC-14 | Role-gated routes (`RequireRole`) | A wrong-role user sees "You do not have permission to view this page." and none of the screen's controls; permitted roles see the screen | `client/tests/lab-03/RequireRole.test.tsx` | Pass |
| **UI-17** *(Issue 8)* | Component | AC-13, BR-19 | Last-Administrator guard counts every active Administrator, not just the filtered list | A search that hides other Admins no longer locks the edited Admin's Role/Active controls | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| **UI-18** *(Issue 8)* | Component | AC-01, safe failure | Login server failure (5xx / unreachable) | Shows "Unable to sign in right now" rather than blaming the credentials | `client/tests/lab-03/Login.test.tsx` | Pass |
| **UI-19** *(Issue 8)* | Component | FR-11, FR-15 | Paging immediately after load is not reset by the search debounce | Page 2 stays selected after the 300ms debounce window (My Tickets; same fix in Staff Queue) | `client/tests/lab-03/MyTickets.test.tsx` | Pass |
| **UI-20** *(Issue 8)* | Component | §6 Mobile | User Management mobile card layout | Each user renders as a card with role, status, and its own Edit action | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| **STYLE-01**| UI Style | §7, §8 | Zen Green tokens, badge classes, read-only field fill, and amber internal notes styling | Read-only fields compute to warm ivory `rgb(241, 240, 232)`, editable fields to white, and the Internal Notes panel to a 1px `#B36B00` border on a pale amber fill. Asserted on **computed** styles in a real browser rather than jsdom, which does not apply the stylesheet | `e2e/lab-03/responsive.spec.ts` | Pass |
| **STYLE-02** *(Issue 8)* | UI Style | ui-spec §8 | No clipped badge or button labels; visible keyboard focus ring | No `.zg-badge`/`.btn` has `scrollWidth > clientWidth`; Tab reaches key inputs and they show an outline or box-shadow focus ring | `e2e/lab-03/responsive.spec.ts` | Pass |
| **RESP-01** | Responsive| §6, §8 | Desktop viewport (1280px) layout integrity across all screens | Full table view, side-by-side panels, zero horizontal body scroll | `e2e/lab-03/responsive.spec.ts` | Pass |
| **RESP-02** | Responsive| §6, §8 | Tablet viewport (768px) layout integrity across all screens | Table views and stacked operational cards, zero horizontal body scroll | `e2e/lab-03/responsive.spec.ts` | Pass |
| **RESP-03** | Responsive| §6, §8 | Mobile viewport (375px) layout integrity and card transformation | Queue **and User Management** tables convert to stacked cards; nav collapses behind the toggler; zero horizontal body scroll | `e2e/lab-03/responsive.spec.ts` | Pass |
| **E2E-01** | E2E | AC-01 | End-to-end user login, session persistence, and logout journey | Each role lands on its own home with name, role badge, and only its own nav; reload keeps the session; after logout every protected route redirects to Login and the API returns 401 | `e2e/lab-03/authentication.spec.ts` | Pass |
| **E2E-02** | E2E | AC-02 | Initial password login and mandatory password change journey | Screens and API (403) are blocked until a valid change; weak/mismatched/wrong-current passwords rejected; old password stops working | `e2e/lab-03/authentication.spec.ts` | Pass |
| **E2E-03** | E2E | AC-05, AC-06, AC-07, AC-08 | IT Staff end-to-end triage: queue search/filters, claim, IT Priority, permitted status | Ticket found by search and combined filters; claimed; IT Priority High while Requested stays Low; only permitted transitions offered; API rejects an invalid jump | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| **E2E-04** | E2E | AC-04, AC-09 | Communication flow: Staff posts Public Comment and Internal Note; Requester replies | Each message appears only in its own panel; Requester sees the comment but never the note, and the notes API returns 403 with no content | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| **E2E-05** | E2E | AC-10–AC-14, AC-16, AC-17 | Administrator user lifecycle and safety rules | List/search/role filter; create with one role; duplicate and invalid input rejected; edit; self-deactivation blocked (UI + API); last-admin refusal shown safely; non-Admins get a forbidden screen and 403 | `e2e/lab-03/user-administration.spec.ts` | Pass |
| **E2E-06** *(Issue 8)* | E2E | BR-01, AC-01 | Invalid login, inactive account, required fields, busy state, server failure | Generic message for wrong password and unknown email (no enumeration); inactive message; form disabled while busy; 500 reported safely | `e2e/lab-03/authentication.spec.ts` | Pass |
| **E2E-07** *(Issue 8)* | E2E | AC-06, AC-08, AC-15 | Requester "Problem Appears Resolved", then reassignment and formal resolution | Indicator does not change status; Staff sees the banner, reassigns, and resolves via the confirmation panel with a required summary; queue reflects the new owner and status | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| **E2E-08** *(Issue 8)* | E2E | AC-05, FR-15 | Queue sort, pagination, empty/no-results/failure/forbidden states | Sort changes the query; pages do not overlap; distinct empty and no-results states; 500 shows a safe message with Retry; a Requester gets a forbidden screen and 403 | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| **E2E-09** *(Issue 8)* | E2E | FR-25, BR-09, AC-02 | A new initial password forces a change at next login; deactivation blocks login | After reset the user's own password fails and the new one opens only the gate; a deactivated user is refused and a reactivated user gets back in | `e2e/lab-03/user-administration.spec.ts` | Pass |

---

## 3. Acceptance Criteria Traceability

| Acceptance Criteria | Mapped Automated Tests | Final Status |
|---|---|---|
| **AC-01** (Valid Login & Session) | `API-01`, `API-04`, `API-05`, `UI-01`, `UI-18`, `E2E-01`, `E2E-06` | Pass |
| **AC-02** (Mandatory Password Change) | `UNIT-01`, `API-06`, `API-07`, `UI-02`, `E2E-02`, `E2E-09` | Pass |
| **AC-03** (Requester Identity Isolation) | `API-10`, `API-11`, `REGR-01` | Pass |
| **AC-04** (Internal Notes Authorization) | `API-08`, `API-09`, `E2E-04` | Pass |
| **AC-05** (Staff Ticket Queue Retrieval) | `UNIT-03`, `API-12`, `API-13`, `API-14`, `API-15`, `UI-04`, `UI-19`, `E2E-03`, `E2E-08` | Pass |
| **AC-06** (Ticket Ownership Assignment) | `API-16`, `API-17`, `API-18`, `UI-05`, `E2E-03`, `E2E-07` | Pass |
| **AC-07** (IT Priority Update) | `API-19`, `UI-05`, `E2E-03` | Pass |
| **AC-08** (Permitted Status Transitions) | `UNIT-02`, `API-20`, `API-21`, `UI-05`, `E2E-03`, `E2E-07` | Pass |
| **AC-09** (Public Comments Thread) | `API-22`, `API-23`, `UI-06`, `E2E-04` | Pass |
| **AC-10** (Admin User Creation) | `API-26`, `UI-07`, `E2E-05` | Pass |
| **AC-11** (Admin Safety: Duplicate Email) | `API-27`, `E2E-05` | Pass |
| **AC-12** (Admin Safety: Self-Deactivation) | `API-28`, `UI-07`, `E2E-05` | Pass |
| **AC-13** (Admin Safety: Last Admin Protection) | `API-29`, `UI-07`, `UI-17`, `E2E-05` (UI refusal; the real rule needs an isolated DB, covered by `API-29`) | Pass |
| **AC-14** (Admin API Authorization) | `API-25`, `UI-16`, `E2E-05` | Pass |
| **AC-15** (Problem Appears Resolved Indicator) | `API-31`, `UI-05`, `E2E-07` | Pass |
| **AC-16** (Admin User Search & Filter) | `API-32`, `UI-07`, `E2E-05` | Pass |
| **AC-17** (Admin User Update) | `API-33`, `UI-07`, `E2E-05`, `E2E-09` | Pass |

---

## 4. Final Test Run (Issue 8)

Environment: Windows 11, Node + PostgreSQL 15 (Docker Compose `db`), migrations applied and `prisma/seed.ts` run. Commands from the repository root:

```bash
docker compose up -d db
npx prisma migrate deploy && npx prisma db seed
(cd server && npx vitest run)     # unit + API/integration + authorization + migration/regression
(cd client && npx vitest run)     # UI component tests (Lab 2 + Lab 3)
npm run test:e2e                  # Playwright E2E + responsive/style (e2e/lab-03), starts both dev servers
```

`e2e/lab-03/global-setup.ts` resets the dedicated `e2e.*@toktickit.com` accounts before every E2E run, so the journeys are repeatable on a shared dev database without touching the seed accounts used for demos. Screenshots are written to `artifacts/lab-03/screenshots/`.

| Suite | Files | Tests | Result |
|---|---|---|---|
| Server (Vitest + Supertest + PostgreSQL) | 19 | 172 | All pass |
| Client (Vitest + React Testing Library) | 13 | 87 | All pass |
| E2E + responsive (Playwright, Chromium) | 4 | 41 | All pass |

<details><summary>Playwright output (<code>npm run test:e2e</code>)</summary>

```
Running 41 tests using 1 worker
✓   1 [chromium] › e2e\lab-03\authentication.spec.ts:12:7 › E2E-01: Login, role home, and logout › each role lands on its own home with name, role badge, and only its own navigation (3.1s)
✓   2 [chromium] › e2e\lab-03\authentication.spec.ts:40:7 › E2E-01: Login, role home, and logout › logout removes authenticated access: protected screens and the API both reject afterwards (2.0s)
✓   3 [chromium] › e2e\lab-03\authentication.spec.ts:56:7 › E2E-01: Login, role home, and logout › session survives a full page reload (1.2s)
✓   4 [chromium] › e2e\lab-03\authentication.spec.ts:65:7 › E2E-06: Invalid login, inactive account, validation, busy, and safe failure › required-field validation renders inline without calling the API (641ms)
✓   5 [chromium] › e2e\lab-03\authentication.spec.ts:79:7 › E2E-06: Invalid login, inactive account, validation, busy, and safe failure › wrong password shows a generic message that does not reveal whether the account exists (1.2s)
✓   6 [chromium] › e2e\lab-03\authentication.spec.ts:91:7 › E2E-06: Invalid login, inactive account, validation, busy, and safe failure › inactive account is refused with a clear, minimal message (862ms)
✓   7 [chromium] › e2e\lab-03\authentication.spec.ts:100:7 › E2E-06: Invalid login, inactive account, validation, busy, and safe failure › busy state disables the form while signing in, and a server failure is reported safely (1.6s)
✓   8 [chromium] › e2e\lab-03\authentication.spec.ts:124:7 › E2E-02: Mandatory first-login password change › normal screens stay unavailable until a valid new password is saved (3.8s)
✓   9 [chromium] › e2e\lab-03\responsive.spec.ts:66:9 › RESP at desktop (1280x900) › authentication: login and mandatory password change (1.3s)
✓  10 [chromium] › e2e\lab-03\responsive.spec.ts:80:9 › RESP at desktop (1280x900) › staff queue: table on desktop/tablet, cards on mobile (1.1s)
✓  11 [chromium] › e2e\lab-03\responsive.spec.ts:101:9 › RESP at desktop (1280x900) › staff ticket detail: read-only vs editable fields, comments vs internal notes (1.6s)
✓  12 [chromium] › e2e\lab-03\responsive.spec.ts:130:9 › RESP at desktop (1280x900) › user management: list, create dialog, edit dialog (2.8s)
✓  13 [chromium] › e2e\lab-03\responsive.spec.ts:160:9 › RESP at desktop (1280x900) › requester regression: My Tickets home and sign-out reachable (878ms)
✓  14 [chromium] › e2e\lab-03\responsive.spec.ts:66:9 › RESP at tablet (768x1024) › authentication: login and mandatory password change (1.5s)
✓  15 [chromium] › e2e\lab-03\responsive.spec.ts:80:9 › RESP at tablet (768x1024) › staff queue: table on desktop/tablet, cards on mobile (883ms)
✓  16 [chromium] › e2e\lab-03\responsive.spec.ts:101:9 › RESP at tablet (768x1024) › staff ticket detail: read-only vs editable fields, comments vs internal notes (1.5s)
✓  17 [chromium] › e2e\lab-03\responsive.spec.ts:130:9 › RESP at tablet (768x1024) › user management: list, create dialog, edit dialog (2.3s)
✓  18 [chromium] › e2e\lab-03\responsive.spec.ts:160:9 › RESP at tablet (768x1024) › requester regression: My Tickets home and sign-out reachable (841ms)
✓  19 [chromium] › e2e\lab-03\responsive.spec.ts:66:9 › RESP at mobile (375x812) › authentication: login and mandatory password change (1.1s)
✓  20 [chromium] › e2e\lab-03\responsive.spec.ts:80:9 › RESP at mobile (375x812) › staff queue: table on desktop/tablet, cards on mobile (1.1s)
✓  21 [chromium] › e2e\lab-03\responsive.spec.ts:101:9 › RESP at mobile (375x812) › staff ticket detail: read-only vs editable fields, comments vs internal notes (1.2s)
✓  22 [chromium] › e2e\lab-03\responsive.spec.ts:130:9 › RESP at mobile (375x812) › user management: list, create dialog, edit dialog (2.2s)
✓  23 [chromium] › e2e\lab-03\responsive.spec.ts:160:9 › RESP at mobile (375x812) › requester regression: My Tickets home and sign-out reachable (1.0s)
✓  24 [chromium] › e2e\lab-03\staff-ticket-flow.spec.ts:27:7 › E2E-03 / E2E-04 / E2E-07: Ticket lifecycle across Requester and IT Staff › Requester creates a Ticket (Lab 2 flow under real auth) (1.3s)
✓  25 [chromium] › e2e\lab-03\staff-ticket-flow.spec.ts:39:7 › E2E-03 / E2E-04 / E2E-07: Ticket lifecycle across Requester and IT Staff › IT Staff finds it in the queue via search and filters, then claims it and sets IT Priority and status (3.7s)
✓  26 [chromium] › e2e\lab-03\staff-ticket-flow.spec.ts:98:7 › E2E-03 / E2E-04 / E2E-07: Ticket lifecycle across Requester and IT Staff › IT Staff posts a Public Comment and a visually distinct Internal Note (4.2s)
✓  27 [chromium] › e2e\lab-03\staff-ticket-flow.spec.ts:127:7 › E2E-03 / E2E-04 / E2E-07: Ticket lifecycle across Requester and IT Staff › Requester sees the operational update and Public Comment, never the Internal Note, and indicates resolution (3.7s)
✓  28 [chromium] › e2e\lab-03\staff-ticket-flow.spec.ts:160:7 › E2E-03 / E2E-04 / E2E-07: Ticket lifecycle across Requester and IT Staff › IT Staff sees the resolution indicator, reassigns, and formally resolves with a summary (3.8s)
✓  29 [chromium] › e2e\lab-03\staff-ticket-flow.spec.ts:199:7 › E2E-08: IT Staff Ticket Queue sort, pagination, and feedback states › sorting and pagination change the query and the rendered rows (1.0s)
✓  30 [chromium] › e2e\lab-03\staff-ticket-flow.spec.ts:220:7 › E2E-08: IT Staff Ticket Queue sort, pagination, and feedback states › empty queue and API failure render distinct, safe states (1.9s)
✓  31 [chromium] › e2e\lab-03\staff-ticket-flow.spec.ts:248:7 › E2E-08: IT Staff Ticket Queue sort, pagination, and feedback states › a Requester is shown a forbidden state on the IT Staff screens, and the API refuses them (1.1s)
✓  32 [chromium] › e2e\lab-03\user-administration.spec.ts:37:7 › E2E-05: User list, search, and role filter › lists Name, Email, Role, Status and Edit; search and role filter narrow the list (2.8s)
✓  33 [chromium] › e2e\lab-03\user-administration.spec.ts:84:7 › E2E-05 / E2E-09: Create, edit, reset password, deactivate › create validates input, rejects duplicates and invalid roles, and creates a user with one role (2.5s)
✓  34 [chromium] › e2e\lab-03\user-administration.spec.ts:142:7 › E2E-05 / E2E-09: Create, edit, reset password, deactivate › the new user must change the initial password at first login (1.2s)
✓  35 [chromium] › e2e\lab-03\user-administration.spec.ts:149:7 › E2E-05 / E2E-09: Create, edit, reset password, deactivate › admin edits name, email, and role; the change takes effect for the user (3.3s)
✓  36 [chromium] › e2e\lab-03\user-administration.spec.ts:177:7 › E2E-05 / E2E-09: Create, edit, reset password, deactivate › a new initial password forces another change at next login (4.7s)
✓  37 [chromium] › e2e\lab-03\user-administration.spec.ts:201:7 › E2E-05 / E2E-09: Create, edit, reset password, deactivate › deactivation blocks login; reactivation restores it (4.8s)
✓  38 [chromium] › e2e\lab-03\user-administration.spec.ts:226:7 › E2E-05: Administrator safety rules › an Administrator cannot deactivate their own account (UI and API) (2.3s)
✓  39 [chromium] › e2e\lab-03\user-administration.spec.ts:246:7 › E2E-05: Administrator safety rules › the last-active-Administrator refusal is shown safely in the edit dialog (2.0s)
✓  40 [chromium] › e2e\lab-03\user-administration.spec.ts:277:9 › E2E-05: Forbidden access for non-Administrators › requester sees a forbidden state and the admin API refuses them (1.1s)
✓  41 [chromium] › e2e\lab-03\user-administration.spec.ts:277:9 › E2E-05: Forbidden access for non-Administrators › staff sees a forbidden state and the admin API refuses them (1.4s)
41 passed (1.5m)
```

</details>

### 4.1. Defects found by the Issue 8 visual inspection and E2E run

| # | Finding | Fix | Guarding test |
|---|---|---|---|
| 1 | The Internal Notes panel carried Bootstrap `border-0`, whose `!important` removed the amber `#B36B00` border required by ui-spec §8. | Dropped `border-0` from that panel in `StaffTicketDetail.tsx`. | `STYLE-01` |
| 2 | A leftover Vite template rule (`#root { text-align: center }` in `index.css`) centered text in every table, card, and comment. | Set it to `start`. | Visual (screenshots) |
| 3 | User Management had no mobile layout; at 375px Role, Status, and Edit were hidden behind a sideways table scroll. | Added a stacked card layout below `md`, matching the Ticket Queue. | `UI-20`, `RESP-03` |
| 4 | A wrong-role user who opened `/admin/users` or `/staff/tickets` saw the generic "Unable to load…" error instead of a forbidden state. | Added the `RequireRole` route gate. The backend `requireRole()` is still the real boundary. | `UI-16`, `E2E-05`, `E2E-08` |
| 5 | The last-active-Administrator guard counted only the admins in the currently filtered list, so a search could wrongly lock a non-last Admin's Role/Active controls. | Count comes from its own unfiltered `role=ADMINISTRATOR` query. | `UI-17` |
| 6 | Login reported "Invalid email or password" for a 500 or an unreachable server. | Only a 401 says that; other failures show "Unable to sign in right now". | `UI-18`, `E2E-06` |
| 7 | The search debounce also fired on mount and reset the page to 1 about 300ms later, bouncing a user who had already paged forward (My Tickets and Staff Queue). This was the real cause of the intermittent `UI-11` failure. | Page resets only when the search text actually changes. | `UI-19`, `UI-11` |
| 8 | `MIGR-02` asserted `mustChangePassword = true` on every User row, so it failed once any non-seed account had changed its password. | Scoped to the 10 `prisma/seed.ts` accounts, which is what the test name describes. | `MIGR-02` |
