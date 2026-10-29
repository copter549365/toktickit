# Lab 4 Test Plan and Traceability Matrix

Status: Planned (Issue 1, #56). Every row below is written before implementation. Each feature issue writes its rows' tests first (TDD) and moves the Final column from `Planned` to `Pass`. Issue 9 (#64) pastes the final run output from `main` into §4.

IDs use an `L4` infix so they don't collide with the Lab 3 rows, which keep running as regression. FR, BR, and AC references point to [specification.md](./specification.md).

---

## 1. Test Strategy

| # | Category | Tooling | Location | Focus in Lab 4 |
|---|---|---|---|---|
| 1 | Unit | Vitest | `server/tests/lab-04/*.unit.test.ts` | Action lifecycle and validators, final transition matrix, resolution gate, dashboard drill-down builder, query normalizers |
| 2 | API / Integration | Vitest + Supertest + test PostgreSQL | `server/tests/lab-04/*.api.test.ts` | Endpoints, role and ownership rules, 409 conflicts, metric values matched against independent queries |
| 3 | Authorization | Supertest (table-driven) | `server/tests/lab-04/authorization.api.test.ts` | Every new route × role × ownership |
| 4 | Workflow | Supertest | `server/tests/lab-04/ticket-workflow.api.test.ts` | Full matrix, gate, side effects, history |
| 5 | Migration / Regression | Vitest + Prisma, plus the Lab 2 and Lab 3 suites | `server/tests/lab-04/migration.test.ts`, `seed.test.ts`, `server/tests/lab-0{2,3}`, `client/tests/lab-0{2,3}`, `e2e/lab-03` | Data preserved, rollback, seed idempotency, earlier behavior intact |
| 6 | Performance smoke | Vitest + generated data | `server/tests/lab-04/performance-smoke.test.ts` | Dashboard and actions-list latency budget |
| 7 | UI Component | Vitest + React Testing Library | `client/tests/lab-04/*.test.tsx` | Dashboards, Actions Taken modes, workflow controls, drill-down filters, shell navigation |
| 8 | UI Style / Responsive / Accessibility | Playwright | `e2e/lab-04/responsive.spec.ts`, `accessibility.spec.ts` | Tokens and badges, read-only vs editable, overflow, clipping, keyboard, focus |
| 9 | End-to-End | Playwright (real server and DB, no HTTP mocking except deliberate failure injection) | `e2e/lab-04/*.spec.ts` | Full journeys and the hardening behaviors |

**Fixtures:**
- API tests reset and seed the test database before each file (the same helper as Lab 3).
- Metric tests insert their own Tickets with known statuses and times, and compare responses with an **independent** Prisma or SQL count. They never compare against the code under test.
- E2E uses the Lab 3 global setup, extended with the Lab 4 seed.

---

## 2. Planned Tests Matrix

### 2.1. Unit

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-L4-01 | Unit | BR-07, AC-05, AC-06 | Action lifecycle function `canTransitionAction(from, to)` | Allows only BR-07 pairs. Create allows PLANNED, IN_PROGRESS, or COMPLETED; COMPLETED and CANCELLED are terminal. | `server/tests/lab-04/actions-taken.unit.test.ts` | Planned |
| UNIT-L4-02 | Unit | BR-03, BR-04, AC-03 | Action field validator (trim, lengths, follow-up note, result on completion, `actionAt` window) | Returns the exact `fieldErrors` for each violation; `followUpNote` is nulled when not required | `server/tests/lab-04/actions-taken.unit.test.ts` | Planned |
| UNIT-L4-03 | Unit | BR-13, AC-11 | Final matrix and `permittedNextStatuses(status, role, isOwner)` | All 18 permitted rows true, every other pair false, `REOPENED → WAITING_FOR_REQUESTER` allowed. Requester gets only `NEW → CANCELLED` on owned Tickets. | `server/tests/lab-04/workflow.unit.test.ts` | Planned |
| UNIT-L4-04 | Unit | BR-14, AC-12 | `evaluateResolutionGate(ticket, actions)` | Reports each unmet condition (owner, completed action, open actions) and a follow-up warning; `met` only when all hold | `server/tests/lab-04/workflow.unit.test.ts` | Planned |
| UNIT-L4-05 | Unit | BR-21..BR-24, FR-16 | Dashboard drill-down builder and active-status set | Builds the exact `{path, query}` per card; active set = 5 statuses | `server/tests/lab-04/dashboard.unit.test.ts` | Planned |
| UNIT-L4-06 | Unit | FR-16 | Query normalizers: `statusGroup`, `requesterResolvedIndicator`, `sortBy=updatedAt` | Valid values applied, invalid ones dropped, `currentStatus` wins over `statusGroup` | `server/tests/lab-04/dashboard.unit.test.ts` | Planned |

### 2.2. API: Actions Taken

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-L4-01 | API | AC-01, FR-01, FR-03 | Create a valid Action Taken | 201; saved under the correct Ticket; `createdBy` = caller; assignee defaults to caller; version 1; client-sent `createdById` and `performedById` ignored | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-02 | API | AC-02, BR-02 | Performer differs from owner | Ticket owned by Michael; Alex completes the action; `performedBy` = Alex; Ticket owner still Michael | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-03 | API | AC-03, BR-03, BR-04 | Validation failures on create and update | 400 `VALIDATION_FAILED` with field errors for: missing follow-up note, short description, COMPLETED without result, future `actionAt`, `actionAt` before Ticket creation. No row written. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-04 | API | AC-04, BR-06 | Invalid assignee on create and on PATCH | 400 `INVALID_ASSIGNEE` for an inactive staff member (kevin), a Requester, and an unknown id. An edit of an action whose stored assignee is inactive requires reassignment. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-05 | API | AC-05, FR-02 | Lifecycle PLANNED → IN_PROGRESS → COMPLETED | 200 each time; version +1 each time; `performedBy` and `completedAt` set on completion; `lastUpdatedBy` = caller | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-06 | API | AC-06, BR-07 | Cancel and lock | Cancel without reason gives 400; with reason gives 200 CANCELLED; any PATCH to a COMPLETED or CANCELLED action gives 409 `ACTION_LOCKED` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-07 | API | AC-07, BR-18 | Stale action update | Second writer with an old `expectedVersion` gets 409 `STALE_UPDATE` with `currentVersion`; first writer's data intact. Missing `expectedVersion` gives 400. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-08 | API | AC-08, BR-10 | Requester access | Requester POST or PATCH gives 403; GET on another Requester's Ticket gives 404; GET on own Ticket gives 200 with every field of every action | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-09 | API | AC-09, BR-09 | Terminal Ticket is read-only | Create or PATCH on a RESOLVED, CLOSED, or CANCELLED Ticket gives 409 `TICKET_NOT_WRITABLE` | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-10 | API | AC-10, BR-11, BR-20 | Ordering and idempotent create | GET is ordered by `actionAt ASC, id ASC` and stable after edits. The same `clientRequestId` twice gives 201 then 200, with one row. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-11 | API | BR-08 | No delete | `DELETE /api/tickets/:id/actions/:actionId` gives 404; row still present | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |
| API-L4-12 | API | BR-19 | Activity timestamp | Action create or update and a Public Comment change `ticket.updatedAt` but not `version`. An Internal Note changes neither. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned |

### 2.3. API: Ticket Workflow

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-L4-13 | Workflow | AC-11, BR-13 | Table-driven matrix: all 18 permitted (from, to, role) rows and a sample of forbidden pairs | Permitted rows give 200. Forbidden pairs give 400 `INVALID_STATUS_TRANSITION`. Requester on a staff route gives 403. | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-L4-14 | Workflow | AC-12, BR-14 | Resolution gate enforced on a direct API call | No owner, no completed action, or an open action each give 409 `RESOLUTION_GATE_NOT_MET` listing the unmet keys, with status unchanged. All conditions met gives 200, with `resolvedAt` set and the indicator cleared. | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-L4-15 | Workflow | AC-13, BR-16 | Advisory Requester signal | `resolve-indicator` leaves `currentStatus` unchanged; the flag is counted in the staff dashboard; the flag is cleared after RESOLVED | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-L4-16 | Workflow | AC-14, BR-17, FR-09 | Append-only history | The 6-step journey gives 6 rows oldest first with actor and note. POST, PATCH, or DELETE on history gives 404. A Requester can read own history; another Requester gets 404. | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-L4-17 | Workflow | AC-15, BR-18 | Stale Ticket mutation | owner, priority, and status with an old `expectedVersion` give 409 `STALE_UPDATE` and nothing changes. Without `expectedVersion`, Lab 3 behavior is unchanged. | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-L4-18 | Workflow | AC-16, BR-15 | Cancel side effects | Staff cancel and Requester `NEW → CANCELLED` both auto-cancel open actions with "Ticket cancelled"; a history row is written; all in one transaction (forced failure leaves everything unchanged) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-L4-19 | Workflow | AC-17, FR-11 | Detail payload | Staff detail has `version`, `permittedNextStatuses`, and `resolutionGate`. Requester detail has no `resolutionGate`, and its permitted list is `["CANCELLED"]` only when NEW. | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-L4-20 | Workflow | BR-13, BR-15 | Reopen and close details | `RESOLVED → REOPENED` needs a reason and clears `resolvedAt`; `RESOLVED → CLOSED` without a summary keeps the stored summary; `REOPENED → WAITING_FOR_REQUESTER` gives 200 | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |

### 2.4. API: Dashboards

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-L4-21 | API | AC-18, BR-22, BR-26 | Requester isolation | Each card value equals the reference SQL (api-spec §3.1) for that Requester; no other Requester's ticket ids appear in any list | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-L4-22 | API | AC-19, BR-22, BR-25 | Requester metrics, lists, and empty state | `attentionRequired`, `recentlyUpdated`, and `recentlyResolved` are ordered, at most 5, and concise. `nina.wong` gets all 0 and empty lists with an unchanged shape. | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-L4-23 | API | AC-21, BR-26 | Requester endpoint roles | Staff and Admin get 403; unauthenticated gets 401; a must-change-password user gets 403 | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-L4-24 | API | BR-21, BR-27 | Recent window boundary and legacy data | `resolvedAt` = now − 6d23h is included and now − 7d1h is excluded. Legacy backfilled Tickets are counted in status metrics. | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-L4-25 | API | AC-20, BR-23 | Staff metrics equal independent counts | Every status, workload, and priority card and `myOpenActions` equals a separate Prisma count. Michael's "my" values are his own; `olivia.chen` gets 0. | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-L4-26 | API | AC-21, BR-24 | Admin additions and roles | Admin gets `userAccounts` equal to user-table counts; IT Staff get `null`; Requester gets 403 | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-L4-27 | API | AC-22, FR-16 | Drill-down consistency | For each card, calling the list endpoint with `drillDown.query` returns `meta.totalCount` equal to the card value | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-L4-28 | API | BR-21, §6.2 handout | Concise payload | Lists hold at most 5 items, and items contain only the documented keys (no description, attachments, or comments) | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |

### 2.5. Authorization, Migration, Regression, Performance

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| SEC-L4-01 | Authorization | AC-08, AC-21, BR-26 | Matrix: every new or changed route × {anonymous, must-change, Requester-owner, Requester-other, IT Staff, Admin} | Each cell returns the code in api-spec §4; no data is leaked in error bodies | `server/tests/lab-04/authorization.api.test.ts` | Planned |
| MIG-L4-01 | Migration | AC-27, §7.3 | Migration from a Lab 3 snapshot | User, Ticket, Attachment, PublicComment, and InternalNote counts are equal. Legacy Tickets have version 1, 0 actions, 1 migrated history row; `itPriority` and `resolvedAt` are backfilled; `requesterResolvedIndicator` is cleared on RESOLVED/CLOSED (BR-15). Applied with `prisma migrate deploy` over a baselined Lab 3 database. | `server/tests/lab-04/migration.test.ts` | Pass |
| MIG-L4-02 | Migration | §7.5 | Rollback and recovery | `rollback.sql` on a scratch database removes the Lab 4 objects and the migration's `_prisma_migrations` row with Lab 3 data intact; `prisma migrate deploy` then re-applies it cleanly | `server/tests/lab-04/migration.test.ts` | Pass |
| MIG-L4-03 | Migration | AC-27, §7.6 | Seed is idempotent and has the required coverage | Running it twice gives identical counts. All 8 statuses, all 3 IT priorities, assigned and unassigned, Tickets with 0, 1, and 4 actions, 2 performers on one Ticket, nina and olivia with zero metrics. | `server/tests/lab-04/seed.test.ts` | Pass |
| REG-L4-01 | Regression | AC-24, FR-18 | Lab 2 and Lab 3 server suites | All pass unchanged | `server/tests/lab-02/*`, `server/tests/lab-03/*` | Planned |
| REG-L4-02 | Regression | AC-24, FR-18 | Lab 2 and Lab 3 client suites | All pass. Landing-page assertions updated only where D-05 applies, with each change listed in §4. | `client/tests/lab-02/*`, `client/tests/lab-03/*` | Planned |
| REG-L4-03 | Regression | AC-24, FR-18 | Lab 3 E2E suite | All pass (D-05 landing URL updates only) | `e2e/lab-03/*` | Planned |
| PERF-L4-01 | Performance smoke | AC-28 | Dashboards with 1,000 Tickets and 3,000 actions | Median of 5 runs < 500 ms for each dashboard endpoint | `server/tests/lab-04/performance-smoke.test.ts` | Planned |
| PERF-L4-02 | Performance smoke | AC-28 | Actions list for one Ticket with 50 actions | Median < 300 ms | `server/tests/lab-04/performance-smoke.test.ts` | Planned |

### 2.6. UI Component

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-L4-01 | UI Component | FR-13, AC-19 | Requester Dashboard renders API data | 4 cards with label and value; each `href` is built from `drillDown`; three lists; dates shown in Asia/Bangkok | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-L4-02 | UI Component | BR-25, AC-19 | Requester empty state | All zeros shown as "0"; empty-list lines; "Create your first ticket" CTA | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-L4-03 | UI Component | AC-03, AC-04 | Actions Taken create-form validation | Follow-up note appears and is required when checked; Result required when Completed; server `INVALID_ASSIGNEE` shown under Assignee with `role="alert"` | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-L4-04 | UI Component | AC-08, BR-10 | Requester read-only mode | List rendered; no Add, Edit, or status controls in the DOM; "Visible to Requester" tag present | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-L4-05 | UI Component | AC-07, AC-25, FR-20, FR-21 | Conflict, double submit, retry | A double click sends one POST; a retry after a network error reuses the `clientRequestId`; a 409 shows the banner and keeps the draft | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-L4-06 | UI Component | AC-05, AC-06 | View and edit modes | View drawer is read-only (ivory); Edit only for open actions; Complete requires Result; Cancel modal requires a reason; locked actions show the note | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-L4-07 | UI Component | AC-17, AC-14 | Workflow control and history | Only `permittedNextStatuses` offered; the Resolve modal checklist disables Confirm when unmet; a 409 gate refreshes the checklist and keeps the summary; success refreshes the badge and history | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-L4-08 | UI Component | AC-23 | Staff Dashboard feedback states | Loading skeleton with `aria-busy`; 500 shows the safe error and Retry; 403 shows the forbidden state; no raw error text | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-L4-09 | UI Component | AC-20, AC-21 | Staff Dashboard content | Status, workload, and priority cards; My Open Actions rows link to `#actions-taken`; User Accounts row only when `userAccounts` is non-null | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-L4-10 | UI Component | FR-17 | AppShell Dashboard navigation | Each role sees the §2 nav order; active item has `aria-current="page"`; `/` redirects to `/dashboard` | `client/tests/lab-04/AppShell.test.tsx` | Planned |
| UI-L4-11 | UI Component | FR-16, AC-22 | URL-driven filters | My Tickets, Queue, and User Management initialize their filters from the URL and update the URL on change; the "Filtered from Dashboard" chip clears them | `client/tests/lab-04/DrillDownFilters.test.tsx` | Planned |

### 2.7. UI Style, Responsive, Accessibility

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-L4-01 | UI Style | ui-spec §1.4, AC-26 | Metric cards | Value and label visible with no overflow (`scrollWidth <= clientWidth`); zero rendered as `0`; Zen Green border and focus ring | `e2e/lab-04/responsive.spec.ts` | Planned |
| STYLE-L4-02 | UI Style | ui-spec §1.1–1.3, §5, AC-26 | Action badges and field semantics | Action status badges contain text and an icon; Performed by is ivory `rgb(241, 240, 232)`; "Visible to Requester" tag present; Internal Notes keep the amber `rgb(179, 107, 0)` border | `e2e/lab-04/responsive.spec.ts` | Planned |
| RESP-L4-01 | Responsive | AC-26 | Desktop 1280 | No body horizontal overflow on every Lab 4 screen, drawer, and modal; screenshots saved | `e2e/lab-04/responsive.spec.ts` | Planned |
| RESP-L4-02 | Responsive | AC-26 | Tablet 768 | Same checks; card grids at 3 and 2 columns | `e2e/lab-04/responsive.spec.ts` | Planned |
| RESP-L4-03 | Responsive | AC-26 | Mobile 375 | Same checks; Actions Taken as cards; action drawer full-screen; no clipped buttons | `e2e/lab-04/responsive.spec.ts` | Planned |
| A11Y-L4-01 | Accessibility | AC-26, ui-spec §10 | Keyboard journey | Tab reaches every card and table button with a visible focus ring; drawer and modal trap focus, close with Esc, and return focus; `#actions-taken` focuses the heading | `e2e/lab-04/accessibility.spec.ts` | Planned |

### 2.8. End-to-End

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| E2E-L4-01 | E2E | AC-01, AC-02, AC-05, AC-08 | Multiple performers on one Ticket | Michael (owner) adds an action assigned to Alex; Alex starts and completes it; Michael adds a second; the Requester sees both read-only with the correct Performed by | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-L4-02 | E2E | AC-03, AC-04 | Validation and inactive-assignee rejection in the UI | Inline errors; an inactive assignee forced through the request gives the inline server error; the form keeps its data | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-L4-03 | E2E | AC-06, AC-07 | Cancel action and concurrent edit | Cancel modal sets CANCELLED and locks the row. Two browser contexts edit the same action: the second sees the conflict banner, reloads, and saves. | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-L4-04 | E2E | AC-12, AC-17, AC-14 | Resolution gate in the UI | Resolve modal blocked by an open action; complete the action; resolve; close; history shows each step; only permitted options at each step | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-L4-05 | E2E | AC-13 | Advisory Requester signal | Requester clicks "Problem Appears Resolved"; status unchanged; staff dashboard "Marked Resolved by Requester" goes up by 1 and drills to the Ticket | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-L4-06 | E2E | AC-11, AC-16 | Reopen and cancel paths | RESOLVED → REOPENED (reason) → WAITING_FOR_REQUESTER; cancelling a Ticket auto-cancels its open action in the list | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-L4-07 | E2E | AC-22, AC-18 | Dashboard drill-down | For the Requester, IT Staff, and Admin dashboards, clicking each card opens a list whose row count equals the card value, with the filter shown | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-L4-08 | E2E | AC-23, AC-21 | Dashboard safe failure and forbidden | Injected 500 shows the retryable error, and Retry recovers; a Requester opening `/staff/tickets` sees the forbidden state | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-L4-09 | E2E | AC-19, AC-20 | Zero metrics | nina sees the all-zero dashboard with CTA; olivia sees 0 My Assigned and an empty My Open Actions | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-L4-10 | E2E | FR-22 | Console and placeholder check | A shared fixture fails a test on any `console.error` or `pageerror`; no "TODO", "Lorem", or "Development Requester" text on any visited page | `e2e/lab-04/fixtures.ts` (used by all Lab 4 specs) | Planned |
| E2E-L4-11 | E2E | AC-25, FR-20, FR-21 | Hardening | Double-clicking Add Comment, Add Action, or a status change makes one change; injected 500 on Create Ticket and Add Action keeps form values | `e2e/lab-04/hardening.spec.ts` | Planned |
| E2E-L4-12 | E2E | AC-24, FR-18 | Representative regression | Login with first-login change; create a Ticket with an attachment; My Tickets search; Public Comment; Internal Note (amber, hidden from the Requester); Admin creates and deactivates a user | `e2e/lab-04/regression.spec.ts` | Planned |

---

## 3. Acceptance Criteria Traceability

| AC | Tests |
|---|---|
| AC-01 Create | API-L4-01, E2E-L4-01 |
| AC-02 Different performer | API-L4-02, E2E-L4-01 |
| AC-03 Validation | UNIT-L4-02, API-L4-03, UI-L4-03, E2E-L4-02 |
| AC-04 Inactive assignee | API-L4-04, UI-L4-03, E2E-L4-02 |
| AC-05 Edit and lifecycle | UNIT-L4-01, API-L4-05, UI-L4-06, E2E-L4-01 |
| AC-06 Cancel and lock | UNIT-L4-01, API-L4-06, UI-L4-06, E2E-L4-03 |
| AC-07 Stale action | API-L4-07, UI-L4-05, E2E-L4-03 |
| AC-08 Role restriction | API-L4-08, SEC-L4-01, UI-L4-04, E2E-L4-01 |
| AC-09 Terminal read-only | API-L4-09 |
| AC-10 Ordering and idempotency | API-L4-10, UI-L4-05 |
| AC-11 Permitted transitions | UNIT-L4-03, API-L4-13, API-L4-20, E2E-L4-06 |
| AC-12 Resolution gate | UNIT-L4-04, API-L4-14, UI-L4-07, E2E-L4-04 |
| AC-13 Advisory signal | API-L4-15, E2E-L4-05 |
| AC-14 Status history | API-L4-16, UI-L4-07, E2E-L4-04 |
| AC-15 Stale workflow | API-L4-17 |
| AC-16 Cancel side effects | API-L4-18, E2E-L4-06 |
| AC-17 Only permitted in UI | API-L4-19, UI-L4-07, E2E-L4-04 |
| AC-18 Requester isolation | API-L4-21, SEC-L4-01, E2E-L4-07 |
| AC-19 Requester metrics and empty | API-L4-22, UI-L4-01, UI-L4-02, E2E-L4-09 |
| AC-20 Staff metrics | API-L4-25, UI-L4-09, E2E-L4-09 |
| AC-21 Admin and dashboard roles | API-L4-23, API-L4-26, SEC-L4-01, UI-L4-09, E2E-L4-08 |
| AC-22 Drill-down | UNIT-L4-05, UNIT-L4-06, API-L4-27, UI-L4-11, E2E-L4-07 |
| AC-23 Dashboard feedback | UI-L4-08, E2E-L4-08 |
| AC-24 Regression | REG-L4-01, REG-L4-02, REG-L4-03, E2E-L4-12 |
| AC-25 Duplicate submit and retention | UI-L4-05, E2E-L4-11 |
| AC-26 Responsive and accessible | STYLE-L4-01, STYLE-L4-02, RESP-L4-01..03, A11Y-L4-01 |
| AC-27 Migration and seed | MIG-L4-01, MIG-L4-02, MIG-L4-03 |
| AC-28 Performance smoke | PERF-L4-01, PERF-L4-02 |

Every AC has at least one automated test. AC-01..AC-23 each also have API or E2E coverage, so the backend is proven to be the authority.

---

## 4. Final Test Run (filled in by Issue 9 from `main`)

*Pending.* This section will contain:
- `npm test` output for the server suites (lab-01..lab-04) and the client suites (lab-02..lab-04);
- `npm run test:e2e` output for `e2e/lab-03` and `e2e/lab-04`;
- totals, skipped count (must be 0), and the commit SHA of `main`;
- any intentional Lab 3 assertion updates (spec D-05), listed with reasons.
