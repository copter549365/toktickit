# TokTickIT — Lab 2 Project Context

Extracted reference from `Lab_02_labsheet.pdf` (CPE 334, Sem 1/2026). This file is a working reference for
building the Lab 2 increment — it is not a substitute for `docs/lab-02/specification.md`, `api-spec.md`,
`ui-spec.md`, or `tests.md`, which are the actual engineering contract.

## 1. Sprint Goal (from handout §1)

Build the **Requester-facing** side of TokTickIT using a temporary "Development Requester" identity instead
of real login. By the end, a Requester can: create a ticket, upload permitted attachments, receive a unique
Ticket Number, view/search/filter/sort/paginate their own tickets in My Tickets, open Ticket Detail, inspect
info + attachments, add an attachment to an existing ticket, and soft-remove one of their own attachments.

## 2. Stakeholder Request (verbatim intent, handout §3)

- Requester describes a problem: category, related system, requested priority, attachments → submit.
- After submission: locate ticket in My Tickets, search/filter own tickets, open Ticket Detail, manage
  permitted attachments.
- Backend generates the official Ticket Number; one Requester must never see another Requester's ticket.
- Because login is Lab 3, provide a **Development Requester Selection** screen ("test login") — pick one of
  several seeded Requesters; that becomes the session's testing identity for create/list/detail/attachments.
- Establish a consistent **Zen Green** theme + reusable form/list/badge/validation/loading/empty/error/
  responsive conventions for later labs to reuse.

## 3. Explicitly Out of Scope (handout §4.2)

- Authentication/security: login, logout, passwords, hashing, sessions, tokens, real role-based auth. The
  Requester selector is a testing mechanism only.
- IT Staff workflow: dashboard/queue, claiming/reassigning, changing IT Priority.
- Collaboration/work tracking: Public Comments, Internal Notes, Actions Taken.
- Ticket lifecycle beyond initial `New` status: resolving, closing, reopening, cancelling.
- Administration: managing users/Requesters/roles/reference data.

## 4. Business Rule Coverage Required (handout §4.3)

Handout gives 3 mandatory examples (Ticket Number generated+unique by backend; new Ticket starts status
`New`; Requester selector ≠ authentication) and requires the student to add rules covering at least:
ticket defaults/system-generated values · Requester selection & switching · ticket ownership · search/
filter/sort/pagination · validation & duplicate-submission prevention · failure behavior & data retention
after errors · attachment upload/download/soft-removal · inactive Requesters · empty & no-results states ·
Ticket Detail access · transition to real auth in Lab 3.
→ Fully enumerated as BR-01..BR-30 in `docs/lab-02/specification.md` §5.

## 5. Required Fields & Validation (handout §4.4)

Create Ticket must capture/display at least: Ticket Number, Ticket Date, Requester, Category, Related
System, Ticket Summary, Requested Priority, Description, Attachments. Student decides which are required/
editable, length limits, trimming, allowed values, client+server validation, post-failure behavior. Ticket
Number is read-only, generated after successful creation.

## 6. Attachment Rules (handout §4.5 — fixed constraints)

- Allowed types: JPG/JPEG, PNG, WEBP, PDF.
- Max size: 5 MB/file.
- Max **active** attachments per ticket: 5.
- Removal = **soft removal** only; removed files must not be downloadable or previewable.
- Student must additionally define: required metadata, safe filename/storage, upload-failure behavior,
  removal permissions, confirmation + removal-reason requirement, behavior when ticket succeeds but
  attachment upload fails, display of removed attachments, preview/download behavior, transaction/
  compensation strategy.

## 7. Database Requirements (handout §5)

Must model at least: **Development Requester, Ticket, Attachment, Category, Related System** (PostgreSQL via
Prisma). Required relationships: Requester 1—N Ticket; Ticket 1—N Attachment; Category 1—N Ticket;
RelatedSystem 1—N Ticket. Must document/justify: unique fields, FKs, optional fields, searched/filtered/
sorted fields, indexes, soft-removal representation, how selected Requester ties to a Ticket, and how the
schema evolves for Lab 3 auth.

**Required seed data**: 4 Categories (Account and Access, Hardware, Software, Network) · ≥6 Related Systems
(e.g. Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer, Corporate Laptop) · ≥4 active
Development Requesters · ≥1 inactive Development Requester (must not appear in the selector). Seed must be
safe to re-run (idempotent, no duplicates).

## 8. REST API Requirements (handout §6)

Minimum capabilities: retrieve active Categories, active Related Systems, active Development Requesters;
create a Ticket; retrieve the selected Requester's Tickets; retrieve one owned Ticket; upload an Attachment;
retrieve Attachment metadata; download an active Attachment; soft-remove an Attachment. Ticket-list endpoint
must support search/filter/sort/pagination with student-defined query params (example:
`GET /api/tickets?search=laptop&page=1`). Every capability needs documented success response, validation
failure, ownership failure, missing-resource behavior, and safe unexpected-error behavior.

**HTTP statuses to cover** (beyond the examples 200/201/400 given): missing resource (404), unsupported file
type (415), oversized upload (413), ownership failure, conflicts (409), unexpected server errors (500).

→ Fully specified per-endpoint in `docs/lab-02/api-spec.md`.

## 9. Zen Green Theme Tokens (handout §7 — fixed)

| Token | Value | Use |
|---|---|---|
| Primary green | `#006B3C` | App header, primary actions, strong emphasis |
| Secondary green | `#0B7A46` | Active tabs, focus accents, links, hover |
| Pale green | `#EAF6EF` | Selected/success/subtle emphasis |
| Page background | `#F5F7F6` (or similarly quiet near-white) | Page background |
| Surface/cards | White, subtle border, restrained shadow | Cards |
| Text | Dark charcoal-green (not pure black) | Body text |
| Editable field | White bg, clear neutral border | Inputs |
| Read-only field | Soft gray-green or warm ivory shading | Read-only fields |
| Error | Dark red text/border, message under field | Validation errors |
| Warning | Amber callout/badge (not decorative) | Warnings |
| Success | Green confirmation, readable text, not color-only | Success states |

## 10. Required Navigation & Screens (handout §8)

**Shell**: TokTickIT identity, My Tickets nav, Create Ticket nav, current Requester identity display, active-
page indication, responsive mobile nav.

**8.1 Development Requester Selection**: TokTickIT title; "for Lab 2 testing only" explanation; Requester
dropdown (active Requesters from PostgreSQL); Continue button; loading/empty/API-failure states; keyboard-
accessible; responsive Zen Green styling. Suggested copy: *"Select a Development Requester to test
requester-specific ticket behavior. This is not a login screen. Authentication and role-based access will be
introduced in Lab 3."* After selection: shell shows Requester name, "Change Requester" action, requester-
scoped data reloads on switch.

**8.2 Create Ticket (Create Mode)**: all required fields, system-generated/read-only values visually
distinct, Summary/Description given space, Attachments placed logically, clear primary submit action.
Suggested arrangement: system-generated fields top → classification fields grouped → Summary/Description
full width → Attachments below → primary/secondary actions at bottom (see Figure 1 in handout).

**8.3 Component rules**: labels above controls; red asterisk for required (not a substitute for the message);
one consistent input height (Description taller/resizable only if layout holds); buttons need visible text
(icons support, don't replace); icon-only controls need accessible label + tooltip; disabled controls visually
distinct & non-activatable; visible keyboard focus; Submit shows busy state + disabled while processing;
validation messages near their field (not one banner only); success state shows the generated Ticket Number
+ next action.

**8.4 My Tickets**: search, suitable filters, sorting, pagination, Create Ticket action, loading/empty/
no-results/failure states; desktop vs. smaller-screen layouts may differ but both usable. Example columns:
Ticket No., Summary, Category, Current Status, Last Updated (not exhaustive — student decides/justifies).

**8.5 Requester Ticket Detail (View Mode)**: current ticket info read-only + required Attachment functions;
student defines field grouping, responsive layout, attachment presentation, navigation. Must **not**
implement Public Comments, Internal Notes, Actions Taken, or status-workflow features.

**8.6 Screen modes**: identify view/create/edit modes; validation/success/failure/empty feedback handled
clearly and tested.

## 11. Responsive Requirements (handout §8.7 — fixed breakpoints)

| Viewport | Required behavior |
|---|---|
| Desktop ≥992px | Multi-column layout as specified; content centered, sensible max width |
| Tablet 768–991px | Two-column layout where practical; Summary/Description get enough width |
| Mobile <768px | Fields stack vertically; touch-friendly buttons; no horizontal page scrolling |
| All sizes | No clipped labels, overlapping messages, hidden buttons, unreadable attachment names |

## 12. UI Style Checking (handout §8.8)

Automated assertions for required CSS classes/field states/labels/asterisks/messages/button behavior ·
Playwright screenshots at desktop/tablet/mobile · visual checklist (no clipping/overlap/unintended
horizontal scroll/inconsistent styling/missing states) · comparison against `ui-spec.md` + approved
illustrations (not memory) · desktop table vs. mobile card/responsive-table inspection · badge consistency
(Requested Priority, IT Priority, Current Status) · filters/pagination/attachment controls/empty states
usable at every viewport.

## 13. Required `specification.md` Sections (handout §8.10, template in §15/Appendix A)

1. Sprint Goal 2. Stakeholder Request (own words) 3. Scope (included/excluded — include Create Ticket, My
Tickets, Ticket Detail, attachment lifecycle, search/filter/sort/pagination, ownership; exclude auth + IT
Staff workflow) 4. Functional Requirements (FR-01..) 5. Business Rules (BR-01..) 6. UI Specification Summary
7. Data Changes 8. API Contract 9. Acceptance Criteria (AC-01.., Given/When/Then) 10. Definition of Done
11. Assumptions and Decisions.

**Example ACs given by handout** (§8.11): AC-01 valid data → ticket saved + Ticket Number shown; AC-02 no
Requester selected → redirected to Selection screen; AC-03 Requester B requests Requester A's ticket → data
not returned. Every AC must map to ≥1 planned test.

## 14. Test Plan Requirements (handout §9, template in Appendix B)

File: `docs/lab-02/tests.md`, planned **before/alongside** implementation (not reconstructed after). Planned-
test table columns: Test ID, Type, Requirement/AC, What It Tests, Expected Result, Automated Test File,
Final. Minimum coverage levels: unit, API/integration, UI component, UI style, responsive, E2E. Must cover
happy paths, invalid input, boundaries, ownership, failures, loading/empty states, responsive behavior,
attachment lifecycle, multi-Requester behavior. Every AC ↔ ≥1 test; every planned automated test names its
real file path.

## 15. UI Spec Requirements (Appendix C checklist)

`ui-spec.md` must explicitly document (not just infer from the mockup image): color tokens & use,
typography/spacing, editable/read-only/invalid/disabled/focused control states, required-marker + validation
placement, button hierarchy (primary/secondary/tertiary/destructive/disabled/busy) + busy state, attachment
selection/error presentation, initial/loading/validation/submitting/success/failure states, desktop/tablet/
mobile layout rules, accessibility (labels, keyboard focus, non-color indicators), visual-inspection
checklist + screenshot paths, app shell + active nav, ticket-list columns + mobile representation, search/
filter/sort/clear-filters/pagination controls, priority & status badge rules, empty-vs-no-results
presentation, Ticket Detail read-only layout, attachment states (active/uploading/invalid/removed/
unavailable), desktop table vs. mobile card behavior, screenshot paths for Create Ticket/My Tickets/Ticket
Detail.

## 16. GitHub Workflow (handout §10)

Kanban: Backlog → Specified → Started → PR Review → Fixing → Done (same as Lab 1). Decompose sprint into
GitHub Issues covering spec/test planning, data design, APIs, frontend screens, automated tests, E2E testing,
visual inspection, release integration.

**Branch flow**: create `lab2-staging` from `main` (post-Lab-1) → each Issue on its own feature branch → PR
into `lab2-staging` (peer-reviewed) → after integration testing, one release PR from `lab2-staging` → `main`.
Never develop directly on `main` or `lab2-staging`.

**This repo's actual Issue breakdown** (GitHub Issues #11–#17, already created):

| # | Title | Feature branch | Depends on |
|---|---|---|---|
| 1 (#11) | Sprint Specification & Engineering Contract Documentation (Spec-DD) | `docs/lab-02-specs` | — |
| 2 (#12) | Database Schema, Seed Data & Base Zen Green Design System | `feat/db-schema-and-design-system` | Issue 1 |
| 3 (#13) | Development Requester Selection & Context Management | `feat/requester-selection` | Issue 2 |
| 4 (#14) | Create Ticket Flow & Initial Attachment Upload | `feat/create-ticket` | Issue 3 |
| 5 (#15) | My Tickets Screen (List/Search/Filter/Sort/Pagination/Isolation) | `feat/my-tickets` | Issue 4 |
| 6 (#16) | Requester Ticket Detail & Attachment Lifecycle | `feat/ticket-detail-attachments` | Issue 5 |
| 7 (#17) | E2E Tests, Responsive Visual Inspection & Release Prep | `feat/e2e-and-release-prep` | Issue 6 |

## 17. AI Agent Rules (handout §11)

Use an AI **specification agent** first to draft/refine `specification.md`, `tests.md`, `ui-spec.md`,
`api-spec.md` — student must review/correct/approve every generated document before handing off. Only then
hand the approved contract to the **AI coding agent**, which must: identify ambiguities before coding rather
than inventing rules silently; work in small tasks tied to one Issue/branch; state which ACs/tests it
completed; never be accepted as "done" with missing/skipped/flaky/unrelated tests; have every changed file/
dependency/migration/command/test reviewed by the student, who must be able to explain the implementation and
demonstrate failure cases.

## 18. Required Repository Structure (handout §12)

```
docs/lab-02/
├── specification.md
├── tests.md
├── ui-spec.md
├── api-spec.md
├── reviewer.md
└── ai-use.md

server/tests/lab-02/
├── create-ticket.api.test.ts
├── my-tickets.api.test.ts
├── ticket-detail.api.test.ts
└── attachments.api.test.ts

client/.../lab-02 tests/
├── CreateTicket.test.tsx
├── MyTickets.test.tsx
├── RequesterTicketDetail.test.tsx
└── AttachmentSection.test.tsx

e2e/lab-02/
└── requester-ticket-flow.spec.ts

artifacts/lab-02/screenshots/
├── create-ticket/
├── my-tickets/
└── ticket-detail/
```

## 19. Definition of Done (handout §13)

**Part 1 — Product Completion** (gates when the AI coding agent may say "done"): all approved scope
implemented; every AC satisfied with traceable passing tests; conformance to data/API/UI/validation/
responsive specs; correct success/failure/boundary handling; current setup/usage docs. Example bar: all
required tests pass from documented commands on final `main`; every AC linked to test evidence; no test
skipped/disabled/commented out; screens/APIs conform to the approved contract; README current.

**Part 2 — Course Delivery** (checked separately): GitHub Issues + feature branches; PRs through the staging
workflow; peer review + approval; responses to review comments; required repo documents; the specified PDF
submission.

## 20. Submission Requirements (handout §14) — grading reference, not implementation work

One PDF, sections "Answer Part 1" through "Answer Part 9" in order, working links, readable screenshots.
Repo/`main` branch is the source of truth.

| Part | Points | Evidence required |
|---|---|---|
| 1. Git Use w/ Engineering Workflow | 10 | Commit history (feature branches → staging → main); GitHub Project/Kanban all-Done; rendered `reviewer.md`; README + `.gitignore` evidence; repo directory structure |
| 2. Spec DD | 5 | Rendered `specification.md` (numbered FR/BR/AC, DoD) + proof it existed before implementation PRs |
| 3. Test DD & Traceability | 10 | Rendered `tests.md` (planned-test table, AC traceability, file paths, final pass status) + passing unit/API/UI output from `main` |
| 4. AI Use w/ Reflection | 5 | Rendered `ai-use.md`: LLM used, 6–10 key prompts table, brief reflection |
| 5. Development Requester Select Screen | 0 | Folded into Part 6 |
| 6. Working Ticket Screen: Create Mode | 10 | Screenshots: initial/validation-failure/submitting/success/API-failure/invalid-attachment; Requester field ↔ `requesterId` proof; reference data from DB; invalid submission messages; valid+invalid attachment demo; backend-down safe error w/ preserved form |
| 7. Working My Tickets Screen | 10 | Requester A list → switch to B → A's tickets gone; search/filter/sort/pagination/empty/no-results/cross-requester-access evidence |
| 8. Working Ticket Screen: View Mode + Attachments | 5 | Owned detail, add attachment, download active, soft-remove w/ reason, retained metadata, blocked removed-download, unauthorized-access test |
| 9. Zen Green UI & Responsive Evidence | 5 | Rendered `ui-spec.md` + desktop/tablet/mobile screenshots + completed visual checklist |

## 21. Figures Referenced in Handout

- **Figure 1** (p.2): illustrative Ticket Detail screen (Zen Green) — Ticket No./Date/Category/Related
  System, Requester, Requested/IT Priority, Current Status, Ticket Owner, Summary, Description, Resolution
  Summary, tabs for Public Comments/Attachments/Service Actions/Event Log. Lab 2 implements Attachments only
  from this tab set — no Comments/Actions/Event Log.
- **Development Requester Selection mockup** (p.9): centered card, icon, dropdown, "only active requesters"
  note, "Authentication coming in Lab 3" callout, Cancel/Continue buttons.
- **My Tickets mockup** (p.11): search bar, Category/Requested Priority/IT Priority/Current Status filters,
  sortable table (Ticket No., Created Date, Summary, Category, Requested Priority, IT Priority, Current
  Status, Ticket Owner, Last Updated), pagination footer.

## 22. Current Repo State (as of this extraction)

Existing stack (from Lab 1, already merged to `main`): React 19 + TypeScript + Vite + Bootstrap 5 (client);
Node.js + Express 5 + TypeScript (server); Prisma ORM v7 + `@prisma/adapter-pg` + PostgreSQL (Docker
Compose); Vitest + Supertest for tests. Only `Category` model exists in `prisma/schema.prisma` so far
(id, name unique, createdAt) with a seeded 4-category list and a working `GET /api/categories` +
`GET /api/health`. No router, no Requester/Ticket/Attachment/RelatedSystem models, no Playwright yet — all
added across Issues 2–7. Current branch work for Lab 2 lives on `lab2-staging`, cut from `main` post-Lab-1.
