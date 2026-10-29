# Lab 4 Sprint Engineering Specification

Status: Specified (Issue 1, #56: Spec-DD and Test-DD). Implementation Issues 2–9 (#57–#64) start only after this contract, [api-spec.md](./api-spec.md), [ui-spec.md](./ui-spec.md), and [tests.md](./tests.md) are merged into `lab4-staging`.

Lab 2 and Lab 3 contracts ([../lab-02/specification.md](../lab-02/specification.md), [../lab-03/specification.md](../lab-03/specification.md)) remain in force. Where this document changes an earlier rule, it names the rule it supersedes (§11).

---

## 1. Sprint Goal

Complete the TokTickIT service-desk workflow:
- IT Staff and Administrators record **Actions Taken** under each Ticket, each with an assignee and a small lifecycle. The primary Ticket Owner keeps coordinating the Ticket as a whole.
- The backend enforces the final Ticket transition matrix. A Ticket cannot become Resolved until the recorded work supports it.
- Every status change is kept in an append-only history.
- Concurrent edits are detected instead of silently overwritten.
- Requesters, IT Staff, and Administrators get concise, backend-calculated **dashboards** that drill down into the existing detailed screens.
- The whole Lab 1–4 application is hardened and regression-tested so it can be demonstrated as one coherent Zen Green product.

---

## 2. Stakeholder Request Interpretation

1. **Plan and track the real work.** IT Staff can already talk to the Requester (Public Comments) and to each other (Internal Notes), but nothing records *what was done*. Each Ticket gets a list of Actions Taken with these fields:
   - when it happened
   - what was done
   - the result
   - who did it (filled in by the system)
   - whether follow-up is needed, with a note explaining it
   - where to find related files

   Several IT Staff members may each record actions on one Ticket. The Ticket Owner stays the single coordinator.
2. **Resolution is a staff decision.** A Requester can still say "this seems fixed", but that is only a hint. Only IT Staff or an Administrator can formally resolve a Ticket, and only when the recorded work supports it. The server enforces this even when someone bypasses the screen.
3. **Dashboards as a starting point, not a replacement.**
   - A Requester sees a short summary of their own Tickets.
   - IT Staff see the queue's shape: what is unassigned, what is theirs, what is urgent, and their own open actions.
   - Each number links to the detailed list it summarizes.
4. **Finish the product.** Everything from Labs 1–3 keeps working. Feedback is consistent everywhere, double submissions are harmless, and forms keep what the user typed after an error. The application is responsive and accessible.

---

## 3. Scope

### 3.1. Included

1. **Actions Taken:**
   - `ActionTaken` model under `Ticket`.
   - Create, update, complete, and cancel. There is no delete.
   - An assignee who must be an active IT Staff member or Administrator.
   - Performed-by and audit fields set automatically.
   - A follow-up rule.
   - Stable ordering.
   - Idempotent create.
   - Read-only view for the owning Requester.
2. **Final Ticket workflow:**
   - Refined transition matrix (BR-13).
   - Resolution gate (BR-14).
   - Append-only status history.
   - Permitted-next-status list returned by the backend.
   - Optimistic concurrency (`version`) on Ticket and Action Taken mutations, with `409 Conflict` for stale updates.
3. **Dashboards:**
   - `GET /api/dashboard/requester` and the Requester Dashboard screen.
   - `GET /api/dashboard/staff` and the IT Staff Dashboard screen.
   - The Administrator view, which is the staff dashboard plus user-account counts.
   - URL-driven filters on My Tickets, Ticket Queue, and User Management so drill-down links work.
   - A Dashboard nav item and a Dashboard landing page for every role.
4. **Database increment:**
   - Prisma migration adding `ActionTaken`, `ActionTakenStatus`, `TicketStatusChange`, `Ticket.version`, and `Ticket.resolvedAt`.
   - Backfill of legacy rows.
   - Documented rollback and recovery.
   - Idempotent seed extension.
5. **Hardening:**
   - Lab 1–3 regression.
   - Consistent feedback states, including conflict.
   - Duplicate-submission protection.
   - Form data kept after recoverable failures.
   - Removal of leftover or placeholder UI.
   - Accessibility and responsive verification.
   - README update.
6. **Evidence:**
   - [tests.md](./tests.md) traceability.
   - E2E suite and screenshots under `artifacts/lab-04/screenshots/`.
   - [reviewer.md](./reviewer.md) and [ai-use.md](./ai-use.md).

### 3.2. Explicitly Excluded (Handout §4.2)

- SLA clocks, escalation engines, on-call scheduling, and breach notifications.
- Email, SMS, LINE, push, or any other external notification.
- Inventory, spare parts, purchasing, cost accounting, time-sheets, payroll, and labor-cost calculation. Actions Taken record no duration or cost.
- Multi-level approvals and electronic signatures.
- BI tools, custom report builders, exports, and trend analytics. Dashboards show live counts only, with no "+3 from yesterday" deltas.
- Deleting Actions Taken, Public Comments, Internal Notes, or status history.
- File upload on Actions Taken. *Attachment Notes* is free text that points to existing Ticket attachments or external locations (§11 D-04).
- Multi-tenancy and production cloud operations.
- Any feature not listed in §3.1.

---

## 4. Functional Requirements

### Actions Taken
- **FR-01:** The system shall let an active IT Staff member or Administrator create an Action Taken on any Ticket whose status allows work (BR-09).
- **FR-02:** The system shall let an active IT Staff member or Administrator update an open Action Taken (`PLANNED` or `IN_PROGRESS`). This includes editing its fields, reassigning it, and moving it to `IN_PROGRESS`, `COMPLETED`, or `CANCELLED` (BR-07).
- **FR-03:** The system shall set `createdBy`, `performedBy`, `lastUpdatedBy`, `createdAt`, `updatedAt`, and `completedAt` from the authenticated session and server clock, ignoring client-supplied values (BR-05).
- **FR-04:** The system shall return a Ticket's Actions Taken:
  - to the owning Requester, read-only;
  - to every IT Staff member and Administrator.

  It shall return `404` to any other Requester (BR-10).
- **FR-05:** The system shall list Actions Taken in a stable order: `actionAt` ascending, then `id` ascending (BR-11).
- **FR-06:** The system shall treat a repeated create request carrying the same `clientRequestId` for the same Ticket as the same action. It returns the existing record instead of creating a duplicate (BR-20).

### Ticket Workflow
- **FR-07:** The system shall enforce the final transition matrix (BR-13) and its role rules on every status-changing endpoint.
- **FR-08:** The system shall refuse a transition to `RESOLVED` unless every resolution-gate condition (BR-14) holds at the moment of the change.
- **FR-09:** The system shall append one `TicketStatusChange` row for every successful status change, including a Requester's own cancellation. It shall expose that history, oldest first, to the owning Requester and to IT Staff and Administrators.
- **FR-10:** The system shall detect stale updates to Tickets and Actions Taken using a `version` number. It shall reject them with `409 Conflict` (`STALE_UPDATE`) without changing data (BR-18).
- **FR-11:** Ticket detail responses shall include:
  - `version`;
  - `permittedNextStatuses` for the current user;
  - for staff only, a `resolutionGate` summary.

  The UI offers only the statuses listed in `permittedNextStatuses`.
- **FR-12:** The Requester "Problem Appears Resolved" signal shall remain advisory (BR-16). It shall be shown to IT Staff on the queue, dashboard, and detail screens.

### Dashboards
- **FR-13:** The system shall provide a Requester Dashboard with the metrics and lists in BR-22. All of them are calculated by the backend from the authenticated Requester's Tickets only.
- **FR-14:** The system shall provide an IT Staff Dashboard with the metrics and lists in BR-23. This includes the current user's open Actions Taken.
- **FR-15:** The system shall provide Administrators with the IT Staff Dashboard plus user-account counts (BR-24).
- **FR-16:** Every dashboard card and list item shall link to a detailed screen: a filtered My Tickets, filtered Ticket Queue, Ticket Detail, or filtered User Management. My Tickets, Ticket Queue, and User Management shall read their filters from, and write them to, the URL query string, so a drill-down link reproduces the filtered view.
- **FR-17:** Every role shall have a `Dashboard` nav item with an active-page indicator. After sign-in, `/` shall open `/dashboard`.

### Hardening and Regression
- **FR-18:** All Lab 2 and Lab 3 screens and APIs shall keep working for their permitted roles:
  - authentication and first-login password change
  - My Tickets, Create Ticket, and Ticket Detail
  - attachments
  - Public Comments and Internal Notes
  - Ticket Queue and staff operations
  - user management
- **FR-19:** Every data screen shall present consistent loading, validation, success, empty, no-results, forbidden, not-found, conflict, and safe-failure feedback (ui-spec §8).
- **FR-20:** Every mutating control shall prevent duplicate submission while a request is in flight. Action creation shall also be idempotent on retry (FR-06).
- **FR-21:** Create and edit forms shall keep the user's entered values after a recoverable failure: validation, conflict, network, or 5xx.
- **FR-22:** The release shall have:
  - no browser console errors in the E2E journeys;
  - no broken links, placeholder text, or unfinished controls;
  - a README covering setup, migration, seed, tests, and the demo script.

---

## 5. Business Rules

### Actions Taken
- **BR-01 (Single Parent):** An Action Taken belongs to exactly one Ticket. `ticketId` is required, set at creation, and can never change.
- **BR-02 (Owner vs. Performer):** The Ticket Owner coordinates the Ticket. An Action Taken may be assigned to, and performed by, any active IT Staff member or Administrator, including someone who is not the Ticket Owner. Creating or completing an action never changes the Ticket Owner.
- **BR-03 (Field Validation):** All text is trimmed before validation.

  | Field | Rule |
  |---|---|
  | `actionAt` | Required. Defaults to the server's now when omitted. Must not be earlier than the Ticket's `createdAt`. Must not be more than 5 minutes after the server's now. Planned future work belongs in the description, not in a future date. |
  | `description` | Required, 5–2,000 characters. |
  | `result` | Optional, up to 2,000 characters. **Required (5 or more characters) when the status is `COMPLETED`.** |
  | `attachmentNotes` | Optional, up to 1,000 characters. |
- **BR-04 (Follow-up):**
  - When `followUpRequired = true`, `followUpNote` is required and must be 5–1,000 characters.
  - When `followUpRequired = false`, any `followUpNote` is discarded and stored as `null`.
  - A Completed action with follow-up required is still Completed. The follow-up is shown as a warning, not a blocker (§11 D-06).
- **BR-05 (Automatic Identity):** Client values for these fields are ignored.
  - `createdById` is the authenticated user at creation.
  - `performedById` and `completedAt` are set when the action enters `COMPLETED`, to the user who completed it and the server time. If the action is created already `COMPLETED`, they are the creator and the creation time.
  - `lastUpdatedById` is the user behind the latest successful change.
- **BR-06 (Assignee):**
  - `assigneeId` defaults to the creator.
  - Whenever `assigneeId` is supplied on create or update, it must reference an existing, **active** user with role `IT_STAFF` or `ADMINISTRATOR`. Otherwise the request fails with `400 INVALID_ASSIGNEE`.
  - If an assignee is later deactivated, existing actions keep their history. The next edit of such an action must reassign it to an active user before any other change can be saved.
- **BR-07 (Action Lifecycle):**

  | From | To | Extra requirement |
  |---|---|---|
  | *(create)* | `PLANNED`, `IN_PROGRESS`, or `COMPLETED` | `COMPLETED` needs `result` |
  | `PLANNED` | `IN_PROGRESS`, `COMPLETED`, `CANCELLED` | `COMPLETED` needs `result`; `CANCELLED` needs `cancelReason` (5–500) |
  | `IN_PROGRESS` | `COMPLETED`, `CANCELLED` | same as above |
  | `COMPLETED`, `CANCELLED` | none (locked) | Any update gets `409 ACTION_LOCKED` |
- **BR-08 (Append-only Work Record):** Actions Taken are never deleted. A mistake in a locked action is corrected by recording a new action that references it in its description. A mistake in an open action is corrected by editing or cancelling it.
- **BR-09 (When Work Can Be Recorded):**
  - Actions Taken can be created or updated only while the Ticket is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`.
  - On a `RESOLVED`, `CLOSED`, or `CANCELLED` Ticket, actions are read-only and writes get `409 TICKET_NOT_WRITABLE`. Further work on a Resolved Ticket requires reopening it first.
  - Recording an action never changes the Ticket status automatically.
- **BR-10 (Visibility):**
  - Actions Taken are **shared** content. The owning Requester sees every field of every action on their Ticket (handout §8.3).
  - A Requester asking for another Requester's Ticket gets `404 TICKET_NOT_FOUND`.
  - The create and edit forms label the section "Visible to the Requester", so confidential content goes to Internal Notes instead.
- **BR-11 (Ordering):**
  - Actions Taken: `actionAt ASC, id ASC`.
  - Status history: `createdAt ASC, id ASC`.

  The order never depends on update time, so editing an action does not move it.

### Ticket Workflow
- **BR-12 (Statuses):** Unchanged from Lab 3: `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`. The **active** set is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, and `REOPENED`. `RESOLVED` is "awaiting closure". `CLOSED` and `CANCELLED` are terminal.
- **BR-13 (Final Transition Matrix):** This supersedes Lab 3 BR-13. "Staff" means `IT_STAFF` and `ADMINISTRATOR`. The Requester path is available only to the Requester who owns the Ticket.

  | From | To | Roles | Confirmation | Required input / effect |
  |---|---|---|---|---|
  | `NEW` | `OPEN` | Staff | No | — |
  | `NEW` | `IN_PROGRESS` | Staff | No | — |
  | `NEW` | `CANCELLED` | Staff, Requester (owner) | Modal | Open actions are auto-cancelled (BR-15) |
  | `OPEN` | `IN_PROGRESS` | Staff | No | — |
  | `OPEN` | `WAITING_FOR_REQUESTER` | Staff | No | — |
  | `OPEN` | `CANCELLED` | Staff | Modal | BR-15 |
  | `IN_PROGRESS` | `WAITING_FOR_REQUESTER` | Staff | No | — |
  | `IN_PROGRESS` | `RESOLVED` | Staff | Modal | **Resolution gate (BR-14)** and `resolutionSummary` |
  | `IN_PROGRESS` | `CANCELLED` | Staff | Modal | BR-15 |
  | `WAITING_FOR_REQUESTER` | `IN_PROGRESS` | Staff | No | — |
  | `WAITING_FOR_REQUESTER` | `RESOLVED` | Staff | Modal | **BR-14** and `resolutionSummary` |
  | `WAITING_FOR_REQUESTER` | `CANCELLED` | Staff | Modal | BR-15 |
  | `RESOLVED` | `CLOSED` | Staff | Modal | `resolutionSummary` optional (keeps the existing value when omitted) |
  | `RESOLVED` | `REOPENED` | Staff | Modal | `reopenReason` (5 or more characters); clears `resolvedAt` |
  | `REOPENED` | `IN_PROGRESS` | Staff | No | — |
  | `REOPENED` | `WAITING_FOR_REQUESTER` | Staff | No | **New in Lab 4** (§11 D-07) |
  | `REOPENED` | `RESOLVED` | Staff | Modal | **BR-14** and an updated `resolutionSummary` |
  | `REOPENED` | `CANCELLED` | Staff | Modal | BR-15 |
  | `CLOSED`, `CANCELLED` | none | — | — | Terminal |

  Any other pair gets `400 INVALID_STATUS_TRANSITION`. A Requester attempting a staff transition gets `403 FORBIDDEN_ROLE`.
- **BR-14 (Resolution Gate):** A transition to `RESOLVED` succeeds only if, inside the same database transaction as the update:
  1. the Ticket has an owner (`ticketOwnerId` not null), and that owner is an active IT Staff member or Administrator;
  2. at least one of its Actions Taken is `COMPLETED`;
  3. none of its Actions Taken are `PLANNED` or `IN_PROGRESS`;
  4. a `resolutionSummary` of 5 or more characters is supplied.

  If any of conditions 1–3 fails, the request gets `409 RESOLUTION_GATE_NOT_MET` with the list of unmet conditions. A missing summary (condition 4) gets `400 VALIDATION_FAILED`. Legacy Tickets get no exemption for future transitions (§7.4).
- **BR-15 (Status Side Effects):**
  - → `RESOLVED`: sets `resolvedAt` to now and clears `requesterResolvedIndicator`.
  - → `REOPENED`: clears `resolvedAt` and stores `reopenReason`.
  - → `CLOSED`: keeps `resolvedAt`.
  - → `CANCELLED`: open Actions Taken become `CANCELLED` with `cancelReason = "Ticket cancelled"` and `lastUpdatedById` set to the actor. `requesterResolvedIndicator` is cleared.

  All side effects run in the same transaction as the status change.
- **BR-16 (Advisory Requester Signal):** Lab 3 BR-06 and FR-13 still apply. The owning Requester may set `requesterResolvedIndicator = true` while the Ticket is `IN_PROGRESS` or `WAITING_FOR_REQUESTER`. This never changes `currentStatus`.
- **BR-17 (Status History):**
  - Every successful status change inserts one `TicketStatusChange` row: `fromStatus`, `toStatus`, `changedById`, an optional `note` (the resolution summary, reopen reason, or cancellation note), and `createdAt`.
  - The row is written in the same transaction as the change.
  - There is no API to edit or delete history.
- **BR-18 (Optimistic Concurrency):**
  - `Ticket.version` starts at 1. It increases by 1 on every change to the Ticket row's workflow fields: status, owner, IT Priority, `requesterResolvedIndicator`, or Requester cancellation.
  - `ActionTaken.version` increases by 1 on every successful update.
  - A mutation that sends `expectedVersion` different from the current value gets `409 STALE_UPDATE` with the current `version` and nothing changes.
  - The check and the increment happen atomically (`UPDATE … WHERE id = ? AND version = ?`).
  - `expectedVersion` is **required** on `PATCH /api/tickets/:id/actions/:actionId`.
  - On the Lab 3 ticket endpoints it is **optional**, for backward compatibility (§11 D-03). The Lab 4 client always sends it.
- **BR-19 (Ticket Activity Timestamp):**
  - `Ticket.updatedAt` changes when the Ticket row changes, and also when an Action Taken is created or updated, a Public Comment is added, or an Attachment is added or removed.
  - Adding an Internal Note does **not** change it, so internal activity is not revealed to the Requester through "recently updated".
  - These activity touches do not increase `version`.
- **BR-20 (Idempotent Action Create):** `clientRequestId` (a client-generated UUID v4) is required on create and unique per Ticket. A repeat create with an existing `(ticketId, clientRequestId)` returns `200` with the stored action, without creating a duplicate.

### Dashboards
- **BR-21 (Calculation Rules):**
  - Every metric is calculated by the backend at request time from the live database. There is no cache and no client-side counting.
  - "Recent" windows are rolling: `[now − 7 × 24 h, now]` on the server clock. Calendar boundaries are not used, so time zone does not affect counts.
  - Timestamps are returned in ISO-8601 UTC. The client displays them in **Asia/Bangkok (UTC+7)**.
  - Lists hold at most 5 items, ordered as stated, with ties broken by `id DESC`.
- **BR-22 (Requester Dashboard):** Only Tickets with `requesterId = me` are included.

  | Key | Label | Calculation | Drill-down |
  |---|---|---|---|
  | `openTickets` | My Open Tickets | status in the active set | `/tickets?statusGroup=active` |
  | `waitingForMe` | Waiting for Me | status `WAITING_FOR_REQUESTER` | `/tickets?currentStatus=WAITING_FOR_REQUESTER` |
  | `resolved` | Resolved | status `RESOLVED` | `/tickets?currentStatus=RESOLVED` |
  | `closed` | Closed | status `CLOSED` | `/tickets?currentStatus=CLOSED` |
  | list `attentionRequired` | Needs My Attention | status `WAITING_FOR_REQUESTER` or `RESOLVED`, `updatedAt DESC` | `/tickets/:id` |
  | list `recentlyUpdated` | Recently Updated | all owned, `updatedAt DESC` | `/tickets/:id`; "View all" → `/tickets?sortBy=updatedAt&sortOrder=desc` |
  | list `recentlyResolved` | Recently Resolved | `resolvedAt` within the last 7 days and status in (`RESOLVED`, `CLOSED`), `resolvedAt DESC` | `/tickets/:id` |
- **BR-23 (IT Staff Dashboard):** All Tickets are included. "me" is the authenticated user.

  | Key | Label | Calculation | Drill-down |
  |---|---|---|---|
  | `statusCounts.<S>` | New / Open / In Progress / Waiting for Requester / Reopened / Resolved | count per status `S` | `/staff/tickets?currentStatus=S` |
  | `unassignedActive` | Unassigned | `ticketOwnerId IS NULL` and active | `/staff/tickets?ticketOwnerId=unassigned&statusGroup=active` |
  | `myActive` | My Assigned | `ticketOwnerId = me` and active | `/staff/tickets?ticketOwnerId=<me>&statusGroup=active` |
  | `priorityCounts.<P>` | IT Priority Low / Medium / High | active and `itPriority = P` | `/staff/tickets?itPriority=P&statusGroup=active` |
  | `requesterMarkedResolved` | Marked Resolved by Requester | active and `requesterResolvedIndicator = true` | `/staff/tickets?statusGroup=active&requesterResolvedIndicator=true` |
  | `myOpenActions` (count and list) | My Open Actions | Actions Taken with `assigneeId = me` and status `PLANNED` or `IN_PROGRESS`, `actionAt ASC` | `/staff/tickets/:ticketId#actions-taken` |
  | list `urgent` | Urgent Tickets | active and `itPriority = HIGH`, `createdAt ASC` (oldest first) | `/staff/tickets/:id` |
  | list `recentlyUpdated` | Recently Updated | all, `updatedAt DESC` | `/staff/tickets/:id`; "View all" → `/staff/tickets?sortBy=updatedAt&sortOrder=desc` |
- **BR-24 (Administrator Additions):** An Administrator receives the BR-23 payload plus `userAccounts`:

  | Key | Calculation | Drill-down |
  |---|---|---|
  | `activeRequesters` | active users with role `REQUESTER` | `/admin/users?role=REQUESTER` |
  | `activeItStaff` | active users with role `IT_STAFF` | `/admin/users?role=IT_STAFF` |
  | `activeAdministrators` | active users with role `ADMINISTRATOR` | `/admin/users?role=ADMINISTRATOR` |
  | `inactiveUsers` | `isActive = false` | `/admin/users` |
- **BR-25 (Empty Behavior):**
  - A zero count is shown as `0`, never hidden. Its card stays clickable and leads to the list's empty state.
  - An empty list shows a one-line message, for example "No tickets need your attention."
  - A Requester with no Tickets sees all zeros and a "Create your first ticket" call to action.
- **BR-26 (Dashboard Authorization):**
  - `GET /api/dashboard/requester` is `REQUESTER` only.
  - `GET /api/dashboard/staff` is `IT_STAFF` and `ADMINISTRATOR` only.
  - Any other role gets `403 FORBIDDEN_ROLE`.
  - Responses never include another Requester's Ticket data (requester endpoint) and never include full Ticket collections.
- **BR-27 (Legacy Data in Metrics):**
  - Tickets created before Lab 4 have zero Actions Taken and count normally in every status or priority metric.
  - Legacy `RESOLVED` and `CLOSED` Tickets get `resolvedAt` backfilled from `updatedAt`, so they can appear in "Recently Resolved" only if they were last updated within the window.

### Preservation and Safety
- **BR-28 (Safe Failure):**
  - Error responses use the Lab 3 envelope (`error`, `message`, `fieldErrors`) and never include stack traces, SQL, or the existence of resources the caller cannot see.
  - An unexpected failure gets `500 INTERNAL_ERROR`, and the UI shows a retryable message without losing input.
- **BR-29 (Carried-forward Rules):**
  - Lab 2 BR-01..BR-30 and Lab 3 BR-01..BR-21 still apply, with the two exceptions below.
  - Lab 3 BR-13 is superseded by BR-13 above.
  - Lab 3 BR-21 is narrowed: an Administrator may perform every IT Staff ticket operation (handout §4.3) and gets the Ticket Queue in navigation.

---

## 6. UI Specification Summary

Full details are in [ui-spec.md](./ui-spec.md). It extends the Lab 3 Zen Green tokens without changing them.

- **Navigation:**
  - Requester: `Dashboard | My Tickets | Create Ticket`
  - IT Staff: `Dashboard | Ticket Queue`
  - Administrator: `Dashboard | Ticket Queue | User Management`

  The active item has an underline and `aria-current="page"`. `/` redirects to `/dashboard`.
- **Requester Dashboard:**
  - Greeting.
  - 4 metric cards (BR-22) that link to filtered My Tickets.
  - "Needs My Attention", "Recently Updated", and "Recently Resolved" lists.
  - Quick Actions: Create Ticket and View My Tickets.
- **IT Staff Dashboard:**
  - Greeting and a Refresh button showing "Updated hh:mm".
  - Status cards.
  - Unassigned, My Assigned, and Marked-Resolved cards.
  - IT Priority breakdown.
  - "My Open Actions", "Urgent Tickets", and "Recently Updated" lists.
  - Administrators also get a "User Accounts" card row.
- **Actions Taken (Staff Ticket Detail):** A section headed "Actions Taken (n)" with a "Visible to Requester" shared-content tag.
  - Desktop shows a table; mobile shows stacked cards.
  - "Add Action" opens an inline create form.
  - "View" opens a read-only panel. "Edit" switches the panel to edit mode, available only for open actions.
  - The status menu offers Start, Complete (asks for a result), and Cancel (modal asking for a reason).
  - Follow-up Note appears and becomes required when Follow-Up Required is checked.
  - An inactive or invalid assignee shows inline errors. A conflict shows a banner offering to reload while keeping the draft.
- **Actions Taken (Requester Ticket Detail):** The same list, read-only, with no controls.
- **Workflow:**
  - The status control lists only `permittedNextStatuses`.
  - The Resolve modal shows the BR-14 checklist (✓ or ✗ with text) and disables Confirm while a condition is unmet. The backend still decides.
  - A successful change refreshes the status badge, version, history, and actions.
  - A "Status History" timeline appears on both detail screens.
- **Feedback:** Shared Loading, Empty, NoResults, Error, Forbidden, NotFound, and Conflict states (ui-spec §8). Busy buttons are disabled and show a spinner.
- **Responsive:** Desktop ≥ 992 px, tablet 768–991 px, mobile < 768 px, as in Lab 3. Card grids reflow to 5, 3, then 2 columns on the staff dashboard and to 4, 2, then 2 columns on the requester dashboard. The page body never scrolls horizontally.

---

## 7. Data Changes

### 7.1. New and Changed Models (Prisma)

```prisma
enum ActionTakenStatus { PLANNED  IN_PROGRESS  COMPLETED  CANCELLED }

model ActionTaken {
  id               Int               @id @default(autoincrement())
  ticketId         Int
  ticket           Ticket            @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  clientRequestId  String            @db.Uuid
  actionAt         DateTime
  description      String            @db.VarChar(2000)
  result           String?           @db.VarChar(2000)
  status           ActionTakenStatus @default(PLANNED)
  assigneeId       Int
  assignee         User              @relation("actionAssignee", fields: [assigneeId], references: [id])
  performedById    Int?
  performedBy      User?             @relation("actionPerformer", fields: [performedById], references: [id])
  createdById      Int
  createdBy        User              @relation("actionCreator", fields: [createdById], references: [id])
  lastUpdatedById  Int
  lastUpdatedBy    User              @relation("actionUpdater", fields: [lastUpdatedById], references: [id])
  followUpRequired Boolean           @default(false)
  followUpNote     String?           @db.VarChar(1000)
  attachmentNotes  String?           @db.VarChar(1000)
  cancelReason     String?           @db.VarChar(500)
  completedAt      DateTime?
  version          Int               @default(1)
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  @@unique([ticketId, clientRequestId])
  @@index([ticketId, actionAt, id])
  @@index([assigneeId, status])
}

model TicketStatusChange {
  id          Int           @id @default(autoincrement())
  ticketId    Int
  ticket      Ticket        @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  fromStatus  TicketStatus?
  toStatus    TicketStatus
  changedById Int?
  changedBy   User?         @relation(fields: [changedById], references: [id])
  note        String?       @db.VarChar(2000)
  isMigrated  Boolean       @default(false)
  createdAt   DateTime      @default(now())

  @@index([ticketId, createdAt, id])
}

// Ticket additions
//   version     Int       @default(1)
//   resolvedAt  DateTime?
//   actionsTaken ActionTaken[]   statusChanges TicketStatusChange[]
//   @@index([currentStatus, ticketOwnerId])  @@index([requesterId, updatedAt])  @@index([itPriority, currentStatus])
// User additions: back-relations for the four ActionTaken roles and TicketStatusChange.
```

### 7.2. Database Design Decisions (justified)

1. **Integer `version` for optimistic concurrency, not `updatedAt` comparison.**
   - JavaScript `Date` keeps milliseconds while PostgreSQL `timestamp(3)` rounds, and BR-19 activity touches change `updatedAt` without a workflow conflict. Both would cause false 409s.
   - An integer compared inside `UPDATE … WHERE version = ?` is exact and atomic, and needs no row lock held across a request.
2. **A separate append-only `TicketStatusChange` table, instead of only overwriting `currentStatus`.**
   - Part 7 requires visible, stable ordering of workflow events, and "who resolved this, when" cannot be rebuilt from the current row.
   - Making the table insert-only gives tamper-evidence without an audit framework.
   - Keeping `currentStatus` on `Ticket` means queue and dashboard queries stay single-table.
3. **Denormalized `Ticket.resolvedAt`.**
   - "Recently Resolved" (BR-22) could be derived from history, but that needs a lateral join per Ticket.
   - One indexed column set and cleared in the same transaction as the status change (BR-15) is cheaper and simpler. History remains the audit source.
4. **`ActionTaken.assigneeId` separate from `performedById` and `createdById`.** These are three different facts, and keeping them apart makes BR-02 checkable:
   - who should do the work (and can be reassigned);
   - who actually completed it (set automatically);
   - who recorded it (set automatically).
5. **No DELETE endpoint for actions or history; `onDelete: Cascade` only from the parent Ticket.**
   - BR-08 and BR-17 are enforced because no route removes an action or a history row, and Tickets themselves are never deleted by the application.
   - The FK follows the Lab 3 `PublicComment` and `InternalNote` convention, so test fixtures can still remove the Tickets they create (§11 D-11).
6. **`@@unique([ticketId, clientRequestId])`.** Makes retried creates idempotent (BR-20) through a database constraint instead of a race-prone "check then insert".

### 7.3. Migration (`prisma/migrations/20261030000000_lab4_actions_taken_and_workflow`)

Additive only: no column is dropped or renamed. Steps, in one migration:
1. Create the `ActionTakenStatus` enum and the `ActionTaken` and `TicketStatusChange` tables with their foreign keys and indexes.
2. `ALTER TABLE "Ticket" ADD COLUMN "version" INT NOT NULL DEFAULT 1, ADD COLUMN "resolvedAt" TIMESTAMP(3)`, plus the new indexes.
3. **Backfill:**
   - `UPDATE "Ticket" SET "itPriority" = "requestedPriority" WHERE "itPriority" IS NULL` (consistent with Lab 3 BR-11).
   - `UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "currentStatus" IN ('RESOLVED','CLOSED')`.
   - `UPDATE "Ticket" SET "requesterResolvedIndicator" = false WHERE "currentStatus" IN ('RESOLVED','CLOSED','CANCELLED')`. Lab 3 left the flag set on resolved Tickets; BR-15 clears it.
   - `INSERT INTO "TicketStatusChange" (ticketId, fromStatus, toStatus, changedById, note, isMigrated, createdAt) SELECT id, NULL, currentStatus, NULL, 'Status at Lab 4 migration', true, updatedAt FROM "Ticket"`.
   - Existing Tickets get **no** Actions Taken.

### 7.4. Legacy Behavior
- Legacy Tickets show "No actions recorded yet." Staff can add actions if the status allows work (BR-09).
- A legacy Ticket that is still active must satisfy BR-14 before it can be resolved.
- Legacy `RESOLVED` and `CLOSED` Tickets stay as they are. Their history shows a single "Status at Lab 4 migration" entry marked *Migrated*.

### 7.5. Rollback and Recovery
- **Before migrating:** take a backup with `npm run db:backup` (`pg_dump -Fc` into `backups/`, which is git-ignored).
- **Rollback script:** `prisma/migrations/20261030000000_lab4_actions_taken_and_workflow/rollback.sql` drops the two new tables, the enum, the new indexes, and the two new Ticket columns. The `itPriority` backfill and the cleared `requesterResolvedIndicator` are kept because they are harmless and consistent with BR-11 and BR-15. In the same transaction it deletes the migration's `_prisma_migrations` row, so `prisma migrate status` reports it as pending and `prisma migrate deploy` re-applies it. `prisma migrate resolve --rolled-back` is not used: it only accepts failed migrations (P3012).
- **Testing:** `server/tests/lab-04/migration.test.ts` checks the following.
  - Before and after migration, the row counts of User, Ticket, Attachment, PublicComment, and InternalNote are equal.
  - Legacy Tickets have `version = 1`, zero actions, and exactly one migrated history row.
  - The Lab 2 and Lab 3 suites still pass.
  - Applying `rollback.sql` to a scratch database followed by `migrate deploy` gives the same schema again.

### 7.6. Seed (idempotent: upsert by email, ticket number, or `clientRequestId`)
- Keeps every Lab 3 account and Ticket unchanged, because Lab 3 E2E fixtures depend on them.
- Adds `nina.wong@toktickit.com` (Requester) with **no Tickets**, giving an all-zero Requester dashboard.
- Adds `olivia.chen@toktickit.com` (IT Staff) owning **no Tickets** and assigned **no actions**, giving zero staff metrics.
- Makes sure at least one Ticket exists in each of the 8 statuses and each IT Priority, both assigned and unassigned, and at least one with `requesterResolvedIndicator = true`.
- Actions Taken:
  - at least one active Ticket with **0** actions;
  - one with **1** `COMPLETED` action;
  - one with **4** actions by **two different** IT Staff members, none of them the owner for at least one action: `COMPLETED` with follow-up, `COMPLETED`, `PLANNED` assigned to `alex.thompson`, and `CANCELLED`;
  - one `IN_PROGRESS` Ticket whose actions are all completed (resolvable);
  - one Ticket with an open action assigned to the inactive `kevin.patel` (demonstrates BR-06).
- Every seeded status change also writes a matching `TicketStatusChange` row.
- Seed actions use fixed `clientRequestId` UUIDs, so re-running creates no duplicates.

---

## 8. API Contract Summary

Full schemas are in [api-spec.md](./api-spec.md). All Lab 2 and Lab 3 endpoints remain, unchanged unless noted.

- **Actions Taken:**
  - `GET /api/tickets/:id/actions` (Requester owner, Staff, Admin)
  - `POST /api/tickets/:id/actions` (Staff, Admin: create, idempotent on `clientRequestId`)
  - `PATCH /api/tickets/:id/actions/:actionId` (Staff, Admin: edit, assign, or change status; `expectedVersion` required)
- **Workflow:**
  - `PATCH /api/staff/tickets/:id/status` adds BR-14 (`409 RESOLUTION_GATE_NOT_MET`), BR-15 side effects, BR-17 history, and an optional `expectedVersion` (`409 STALE_UPDATE`).
  - `PATCH …/owner`, `PATCH …/priority`, `PATCH /api/tickets/:id/resolve-indicator`, and `PATCH /api/tickets/:id/cancel` accept an optional `expectedVersion`.
  - `GET /api/tickets/:id/status-history` (Requester owner, Staff, Admin).
  - `GET /api/tickets/:id` and `GET /api/staff/tickets/:id` add `version`, `resolvedAt`, and `permittedNextStatuses`. The staff endpoint also adds `resolutionGate`.
- **Dashboards:**
  - `GET /api/dashboard/requester` (Requester)
  - `GET /api/dashboard/staff` (Staff, Admin; Admin also gets `userAccounts`)
- **Drill-down filters:**
  - `GET /api/tickets` adds `statusGroup=active` and `sortBy=updatedAt`.
  - `GET /api/staff/tickets` adds `statusGroup=active` and `requesterResolvedIndicator=true`.
- **New error codes:** `STALE_UPDATE` (409), `RESOLUTION_GATE_NOT_MET` (409), `ACTION_LOCKED` (409), `TICKET_NOT_WRITABLE` (409), `INVALID_ASSIGNEE` (400), `ACTION_NOT_FOUND` (404).

---

## 9. Acceptance Criteria

### Actions Taken
- **AC-01 (Create):** Given an active IT Staff user and valid data on an `IN_PROGRESS` Ticket, when `POST /api/tickets/:id/actions` is called, then `201` returns an action under that Ticket. Its `createdBy` is the authenticated user, its `assignee` is the approved assignee (the creator by default), its `version` is 1, and any client-supplied `createdById` or `performedById` is ignored.
- **AC-02 (Different Performer than Owner):** Given a Ticket owned by Michael, when Alex creates an action and completes it, then the action shows `performedBy = Alex`, while `ticketOwner` stays Michael.
- **AC-03 (Validation):** Given `followUpRequired = true` with no `followUpNote`, or a `description` under 5 characters, or `status = COMPLETED` without `result`, or an `actionAt` in the future, when the action is created or updated, then `400 VALIDATION_FAILED` returns field-level errors and nothing is saved.
- **AC-04 (Inactive Assignee Rejected):** Given an inactive IT Staff user, a Requester, or a nonexistent id as `assigneeId`, when an action is created or reassigned, then `400 INVALID_ASSIGNEE` is returned and nothing is saved.
- **AC-05 (Edit and Lifecycle):** Given a `PLANNED` action, when it is updated to `IN_PROGRESS` and then `COMPLETED` with a result, then each update returns `200` with `version` increased by 1, and `performedBy` and `completedAt` are set on completion.
- **AC-06 (Cancel and Lock):** Given an open action, when it is cancelled with a reason, then its status is `CANCELLED`. Any later update to a `COMPLETED` or `CANCELLED` action returns `409 ACTION_LOCKED`.
- **AC-07 (Stale Action Update):** Given two staff users who both loaded an action at version 2, when the first saves (version 3) and the second saves with `expectedVersion = 2`, then the second gets `409 STALE_UPDATE` with `currentVersion = 3`, and the first user's change is kept.
- **AC-08 (Role Restriction):** Given a Requester, when calling `POST` or `PATCH` on Actions Taken, even for their own Ticket, then `403 FORBIDDEN_ROLE` is returned. When calling `GET` on another Requester's Ticket, `404` is returned. When calling `GET` on their own Ticket, all actions are returned.
- **AC-09 (Terminal Ticket Read-only):** Given a `RESOLVED`, `CLOSED`, or `CANCELLED` Ticket, when an action is created or updated, then `409 TICKET_NOT_WRITABLE` is returned.
- **AC-10 (Ordering and Idempotency):** Given several actions with different `actionAt` values, then `GET` returns them ordered by `actionAt ASC, id ASC` across repeated calls and after edits. Given the same `clientRequestId` posted twice, then exactly one action exists and the second call returns `200` with that action.

### Workflow
- **AC-11 (Permitted Transitions):** Given each `(from, to, role)` in the BR-13 matrix, the change succeeds. Given any pair not in the matrix, it returns `400 INVALID_STATUS_TRANSITION`. Given a Requester attempting a staff transition, it returns `403`.
- **AC-12 (Resolution Gate):** Given an `IN_PROGRESS` Ticket with any of these:
  - no owner;
  - no `COMPLETED` action;
  - at least one `PLANNED` or `IN_PROGRESS` action;

  when Staff requests `RESOLVED`, even by calling the API directly, then `409 RESOLUTION_GATE_NOT_MET` lists every unmet condition and the status is unchanged. When all conditions hold and a summary is supplied, then `200`, `resolvedAt` is set, and `requesterResolvedIndicator` is false.
- **AC-13 (Advisory Requester Signal):** Given a Requester who sets "Problem Appears Resolved", then `currentStatus` is unchanged, the Ticket appears in the staff `requesterMarkedResolved` metric, and the indicator clears when the Ticket is resolved.
- **AC-14 (Append-only Status History):** Given a Ticket that moves through `NEW → IN_PROGRESS → RESOLVED → REOPENED → IN_PROGRESS → RESOLVED → CLOSED`, then `GET /status-history` returns 6 entries oldest first, each with from, to, actor, and time. No endpoint exists to modify or delete them.
- **AC-15 (Stale Workflow Update):** Given two staff users on the same Ticket at version *v*, when one changes the status and the other then changes the owner with `expectedVersion = v`, then the second gets `409 STALE_UPDATE` and the owner is unchanged.
- **AC-16 (Cancel Side Effects):** Given a Ticket with one `PLANNED` action, when Staff cancels the Ticket, then the action becomes `CANCELLED` with reason "Ticket cancelled", and both changes happen together.
- **AC-17 (UI Shows Only Permitted Transitions):** Given a Staff user on a Ticket detail screen, then the status control offers exactly the backend `permittedNextStatuses`. After a successful change, the status badge, history, and control refresh without a page reload.

### Dashboards
- **AC-18 (Requester Isolation):** Given an authenticated Requester, when `GET /api/dashboard/requester` is called, then only metrics and recent Tickets owned by that Requester are returned. The counts equal the documented SQL for that Requester, and no other Requester's ticket numbers appear.
- **AC-19 (Requester Metrics and Empty State):** Given the seeded Requesters, then each card value equals its BR-22 calculation. For `nina.wong`, all values are 0, every list is empty, and the screen shows the empty call to action.
- **AC-20 (Staff Metrics):** Given seed data, when `GET /api/dashboard/staff` is called by Michael, then every BR-23 value equals an independent Prisma count. `myActive` and `myOpenActions` reflect Michael only, and for `olivia.chen` they are 0.
- **AC-21 (Admin Additions and Role Restrictions):** Given an Administrator, the staff dashboard includes `userAccounts` equal to the user-table counts. Given IT Staff, `userAccounts` is absent. Given a Requester calling the staff endpoint, or Staff or an Admin calling the requester endpoint, `403` is returned.
- **AC-22 (Drill-down):** Given a dashboard card, when activated by mouse or keyboard, then the target list opens with matching filters already applied (visible in the URL and filter controls), and its row count equals the card value.
- **AC-23 (Dashboard Feedback States):** Given a slow, failing (500), or forbidden dashboard request, then the screen shows the loading skeleton, a retryable safe error, or the forbidden state respectively. No raw error text or stack trace is shown.

### Hardening
- **AC-24 (Regression):** Given the Lab 2 and Lab 3 automated suites (server, client, E2E with any updated landing-page expectations), then they all pass on `main` together with the Lab 4 suites.
- **AC-25 (Duplicate Submission and Data Retention):** Given a user double-clicking Save on Add Action, Add Comment, or a status change, then only one record or change is made. Given a failed save (409, 500, or network), then the form keeps the entered values.
- **AC-26 (Responsive and Accessible):** Given each Lab 4 screen at 1280, 768, and 375 px, then the body has no horizontal overflow, controls do not overlap or clip, every card and action is keyboard-reachable with a visible focus ring, and status, priority, and shared versus private content are indicated by text as well as color.
- **AC-27 (Migration and Seed):** Given a database at the Lab 3 schema with data, when the Lab 4 migration and seed run (the seed twice), then no pre-existing row is lost, legacy Tickets have version 1, zero actions, and one migrated history entry, and the second seed run creates no duplicates.
- **AC-28 (Performance Smoke):** Given 1,000 Tickets and 3,000 Actions Taken, then each dashboard endpoint responds in under 500 ms and the Actions Taken list for one Ticket in under 300 ms, measured as the median of 5 runs on the local test database.

---

## 10. Product Definition of Done

The Lab 4 product is Done only when every item below is true on `main`:

1. **Contract:** FR-01..FR-22, BR-01..BR-29, and AC-01..AC-28 are implemented as written, or each deviation is recorded in §11 and approved in the PR review.
2. **Traceability:** Every AC maps to at least one row in [tests.md](./tests.md), and every row's Final column is `Pass`, with the real test-file path.
3. **Automated tests pass with zero skipped:**
   - `server/tests/lab-02`, `lab-03`, and `lab-04`
   - `client/tests/lab-02`, `lab-03`, and `lab-04`
   - `e2e/lab-03` and `e2e/lab-04`

   Captured output is pasted into tests.md §4.
4. **Backend authority:** Every Lab 4 write endpoint has an API test proving its role restriction and a test proving it rejects stale or invalid input with the documented code.
5. **Data:**
   - The migration is applied from the Lab 3 state without data loss.
   - Rollback is documented and was exercised once.
   - The seed is idempotent, and its data yields zero and non-zero values for every dashboard metric.
6. **UI quality:**
   - The ui-spec §9 checklist is completed at 1280, 768, and 375 px with no open defects.
   - The browser console shows no errors during the E2E journeys.
   - No placeholder text, dead links, or leftover Lab 2/3 debug UI remain.
7. **Evidence:**
   - Screenshots are in `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken,workflow}`.
   - The README covers setup, migrate, seed, test, and demo.
   - [reviewer.md](./reviewer.md) records every PR with its reviewer, comments, responses, and approval.
   - [ai-use.md](./ai-use.md) lists 6–10 prompts and a reflection.
8. **Process:**
   - Every Issue (#56–#64) was merged through a feature branch, then a PR to `lab4-staging`, then the release PR to `main`.
   - Every Kanban card is in Done.
   - This specification was merged before the first implementation PR.

---

## 11. Assumptions and Decisions

- **D-01 (Assignee and lifecycle on Actions Taken):**
  - The stakeholder field list has no assignee or status. The grading rubric, however, asks to demonstrate "assign, status transition, complete, cancel, inactive-assignee rejection" for Actions Taken.
  - We add `assigneeId` and a 4-state lifecycle so one action line can be planned and later completed.
  - "Performed by (auto)" is interpreted as *the user who completed the action*. The recorder is kept separately as `createdBy`.
- **D-02 (Resolution gate content):**
  - The handout requires that "the resolution rule" be enforced on the backend but leaves the rule open.
  - We require an owner, at least one completed action, no open actions, and a summary. This ties formal resolution to recorded work.
  - Follow-up flags are warnings, not blockers (D-06).
- **D-03 (Optional `expectedVersion` on Lab 3 endpoints):**
  - Making it required would break the Lab 3 API contract and its passing tests.
  - The Lab 4 client always sends it, and the new Actions Taken PATCH requires it.
  - Stale-update protection is therefore complete for every screen in the product, and older callers keep their Lab 3 behavior.
- **D-04 (Attachment Notes are text):**
  - Uploading files to individual actions would duplicate the Lab 2 attachment rules (type, size, 5-per-Ticket limit).
  - Attachment Notes is free text that names a Ticket attachment or an external location ("see screenshot error-03.png").
- **D-05 (Dashboard landing page):**
  - `/` now opens `/dashboard` for every role. Lab 3 E2E assertions about the post-login landing URL are updated in Issue 8 as an intentional change, not a regression.
  - The old landing pages stay one click away in the navigation.
- **D-06 (Follow-up does not block):** A Completed action with follow-up required is still shown with an amber "Follow-up required" badge, and the Resolve modal warns about it. Staff may still resolve, because the follow-up can belong to another team or a later Ticket. SLA and escalation features are excluded.
- **D-07 (`REOPENED → WAITING_FOR_REQUESTER`):** Added because a reopened problem often needs new information from the Requester first. Without it, staff had to move the Ticket to In Progress just to ask a question.
- **D-08 (No automatic status changes from actions):** Recording or completing an action never moves the Ticket. Status changes stay explicit staff decisions with their own confirmation and history entry.
- **D-09 (Time zone):** All users are on one campus, so display uses Asia/Bangkok. Metrics use rolling windows, which avoids midnight-boundary disagreement between server (UTC) and client.
- **D-10 (Internal Notes do not touch `updatedAt`):** Prevents a Requester's "Recently Updated" list from revealing that staff wrote something private.
- **D-11 (Cascade instead of Restrict, Issue 2):**
  - The first draft used `onDelete: Restrict` on `ActionTaken` and `TicketStatusChange`. That would break the cleanup of every Lab 3 API suite (`prisma.ticket.deleteMany` on its own fixtures) as soon as status changes write history (Issue 5), which conflicts with AC-24.
  - The application has no Ticket delete path, so append-only behavior is unchanged.
  - Restrict would only have guarded against manual SQL.
  - Trade-off (raised in PR #66 review): §7.2 originally used Restrict as a database-level guard for append-only history. Cascade gives that up. The alternative would be to have every test helper delete actions and history before deleting its Tickets. That means editing every Lab 3 suite's cleanup for a guard no application path needs, so Cascade stays.
