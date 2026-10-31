# TokTickIT — Lab 4 Handout Context

Extracted reference from `SE+Lab+4.pdf` (CPE 334, Sem 1/2026, 60 points). This is a working reference for
the Lab 4 increment. It does not replace `specification.md`, `api-spec.md`, `ui-spec.md`, or `tests.md`,
which form the actual engineering contract. When this file and the contract disagree, the contract wins,
and the difference must be recorded in specification.md §11 (Assumptions and Decisions).

## 1. Sprint Goal (§1)

Complete the core service-desk workflow:
- IT Staff and Administrators create and update **Actions Taken** for a Ticket.
- One primary Ticket Owner; different IT Staff may record Actions Taken on the same Ticket.
- Role-appropriate **dashboards** for Requester, IT Staff, and Administrator.
- Full Ticket lifecycle implemented and tested from creation to closure or cancellation.
- All Lab 1–3 behavior keeps working: auth, authorization, Requester, IT Staff, Admin, comments, notes,
  and attachments.
- Polished, responsive, accessible, secure, and ready for the final demo.

## 2. Stakeholder Request (§3)

Each Action Taken has these fields:
- Action Date/Time
- Action Description
- Result
- Performed by (set automatically)
- Follow-Up Required? (yes/no)
- Follow-up Note (required when follow-up is needed)
- Attachment Notes (which file to look for, such as images)

Other points from the request:
- The primary Ticket Owner coordinates the Ticket as a whole.
- A Requester may indicate that the problem "appears resolved". This is **advisory only**. IT Staff must
  review the work and formally update the Ticket.
- Dashboards should be concise and link to the detailed screens.
- Polish everything under the **Zen Green** design language.

## 3. Contract Must Cover (§4.1)

- Actions Taken fields
- The complete status-transition matrix
- Dashboard metrics, drill-down, empty states, and calculation rules
- DB, Prisma migration, seed, and REST increments
- Zen Green UI, responsive behavior, and accessibility
- Security, authorization, concurrency, safe failure, and regression
- Acceptance criteria, planned tests, hardening evidence, and Product DoD

## 4. Excluded (§4.2)

- SLA clocks, escalation, on-call scheduling, and breach notifications
- Email, SMS, LINE, and push notifications
- Inventory, spare parts, purchasing, and cost accounting
- Timesheets, payroll, and labor cost
- Multi-level approvals and e-signatures
- BI tools, report builders, and exports
- Multi-tenancy and production cloud operations
- Any feature not approved in the Sprint 4 contract

## 5. Roles for Actions Taken (§4.3)

| Role | Minimum behavior |
|---|---|
| Requester | Views Actions Taken on **owned** Tickets (§8.3: Requesters see all Actions Taken items). Never creates or changes them. |
| IT Staff | Creates and updates Actions Taken on accessible Tickets. |
| Administrator | Everything IT Staff can do, plus admin access for support and testing. |

The backend enforces every write. Hiding a control in the UI is not authorization.

## 6. Mandatory Business Rules (§4.4, examples only)

- BR-01: An Action Taken belongs to exactly one Ticket.
- BR-02: The Ticket Owner coordinates the Ticket, but an Action Taken may be performed by a different IT Staff
  member.

Students number the rest (BR-03, BR-04, …) in `docs/lab-04/specification.md`. They must cover assignment,
dates, statuses, the resolution gate, and dashboard calculations.

## 7. Status and Resolution (§4.5)

- Statuses: New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled.
- The final transition matrix and the authorized role for each transition must be documented.
- The backend enforces the **resolution rule** even when a client bypasses the screen.
- A Requester's "appears resolved" indication does **not** change the status to Resolved.

## 8. Dashboards (§4.6, §6.2, §8.1, §8.2)

- **Requester:** total open Tickets, Tickets waiting for the Requester, recently updated, and recently
  resolved. Covers only the Requester's own Tickets, and the backend enforces this.
- **IT Staff:** unassigned Tickets, Tickets owned by me, counts by status or IT Priority, and recently
  updated Tickets. Recent or urgent lists open the Queue, Ticket Detail, or a filtered view.
- **Admin:** may reuse the IT Staff dashboard, plus optional user-account counts.
- The backend computes every metric from authoritative data. Each card defines its query, its empty
  behavior, and its drill-down link or query params.
- Endpoints return concise data, not whole Ticket collections. Time zones and date boundaries must be
  defined.

## 9. Database (§5)

- One Ticket has many Actions Taken. All earlier data (Users, Tickets, Attachments, Comments, Notes) stays
  valid.
- The design must decide fields, types, foreign keys, indexes, enums, timestamps, optimistic concurrency or
  stale-update handling, and migration strategy.
- Justify **at least two** DB design decisions in specification.md.
- The migration preserves all data. Define how legacy Tickets with no Actions Taken behave and how
  dashboards treat them. Document **and test** a rollback or recovery approach.
- The seed is idempotent and must include:
  - every status and priority
  - assigned and unassigned Tickets
  - Tickets with 0, 1, and many Actions Taken
  - data that produces both zero and non-zero dashboard metrics

## 10. REST API (§6) → `docs/lab-04/api-spec.md`

The API must support:
- creating and updating Actions Taken
- the Requester dashboard
- the IT Staff dashboard
- all Lab 2 and Lab 3 APIs, unchanged
- health and validation

Detection of concurrent or stale updates is required so that nobody unknowingly overwrites another user's
change (for example, with a version field and **409 Conflict**).

## 11. UI (§7, §8)

- Dashboard nav per role, with a clear active-page indicator.
- Reuse the existing Ticket, tab, badge, button, form, table, card, loading, empty, and error conventions.
- Status, priority, and private versus shared content are visually distinct.
- Concise metric cards with accessible drill-down.
- Visible focus, full keyboard operation, semantic labels, and status cues that don't rely on color alone.
- No clipping, overlap, inaccessible modals, or horizontal scroll.
- Remove temporary, duplicate, or obsolete UI left over from earlier labs.
- **Actions Taken area on Staff Ticket Detail:** a list or table, a create mode, and a view/edit mode.
- **Status controls** show only permitted transitions, and a successful change refreshes the summary
  status.
- **Hardening (§8.5):**
  - All earlier screens still work.
  - Feedback is consistent for loading, validation, success, empty, forbidden, conflict, not-found, and
    safe API failure.
  - Duplicate clicks and network retries are prevented.
  - Forms keep entered data after a recoverable failure.
  - No console errors, broken links, or placeholder text.
  - README is current: setup, seed, migration, tests, and demo.
- Responsive and accessibility rules are the same as Labs 2 and 3.

## 12. Required Files (§9, §10, §12)

```
docs/lab-04/       specification.md tests.md ui-spec.md api-spec.md reviewer.md ai-use.md
server/tests/lab-04/  actions-taken.api.test.ts ticket-workflow.api.test.ts
                      requester-dashboard.api.test.ts staff-dashboard.api.test.ts
client/tests/lab-04/  StaffDashboard.test.tsx RequesterDashboard.test.tsx
                      ActionsTaken.test.tsx TicketWorkflow.test.tsx
e2e/lab-04/        actions-taken-flow.spec.ts ticket-resolution.spec.ts dashboards.spec.ts
artifacts/lab-04/screenshots/  staff-dashboard/ requester-dashboard/ actions-taken/
```

specification.md sections, in this order:
1. Sprint Goal
2. Stakeholder Request
3. Scope
4. FR
5. BR
6. UI Summary
7. Data Changes
8. API Contract
9. Acceptance Criteria (AC-01, …)
10. Definition of Done
11. Assumptions and Decisions

Every AC maps to at least one test.

tests.md has these columns: Test ID | Type | Requirement/AC | What It Tests | Expected Result |
Automated Test File | Final. It must cover unit, API, UI component, UI style, responsive, authorization,
workflow, migration/regression, performance-smoke, and E2E tests.

## 13. Workflow (§11)

- Use the same Kanban statuses as earlier labs.
- Create the Issues **before coding**.
- Branch flow: feature branch → PR → `lab4-staging` → PR → `main`.
- Record peer review in reviewer.md: reviewer identity, PR links, comments, responses, and approvals.

## 14. Grading — one PDF, "Answer Part 1..9" (§14)

| Part | Pts | Evidence |
|---|---|---|
| 1 Git workflow | 10 | branches → lab4-staging → main; Kanban all Done; reviewer.md; README + .gitignore; tree |
| 2 Spec DD | 5 | specification.md with FR/BR/transitions/dashboard calcs/AC/migration/DoD; spec existed **before** impl PRs |
| 3 Test DD | 10 | tests.md traceability + passing unit/API/UI/auth/workflow/regression/E2E output from main |
| 4 AI use | 5 | ai-use.md: LLM name, 6–10 key prompts, "My Reflection" |
| 5 IT Staff Dashboard | 5 | metrics, current-user Actions Taken, recent/urgent, drill-down, loading/empty/forbidden/failure, responsive, **metrics match DB queries** |
| 6 Actions Taken UI | 10 | list, create, assign, edit, status transition, complete, cancel, validation, **inactive-assignee rejection**, role restrictions, safe failures, responsive, multiple actions on one Ticket |
| 7 Ticket Workflow | 5 | permitted transitions, stable ordering, **append-only** behavior, role visibility |
| 8 Requester Dashboard + regression | 5 | owned metrics, attention-required, drill-down, ownership protection, regression for all Lab 2–3 features |
| 9 Zen Green / a11y | 5 | ui-spec.md + desktop/tablet/mobile screenshots + visual & accessibility checklist |

> Note: Part 6 grades "assign / status transition / complete / cancel / inactive-assignee rejection" for
> Actions Taken. The §3 field list has no assignee or status, so the contract must decide how to cover this.
> The proposed decision is that each Action Taken has an assignee (an active IT Staff or Admin member) and a
> lifecycle such as Planned → In Progress → Completed / Cancelled. Record the decision in specification.md
> §11.
