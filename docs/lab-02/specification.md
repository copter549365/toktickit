# Lab 2 Sprint Engineering Specification

Status: Draft for review (Issue 1 — Spec-DD). Implementation begins only after this contract, `tests.md`,
`ui-spec.md`, and `api-spec.md` are approved.

## 1. Sprint Goal

Deliver the Requester-facing slice of TokTickIT: a Development Requester can select a seeded test identity,
create an IT support ticket with permitted attachments, receive a backend-generated Ticket Number, find and
filter their own tickets in My Tickets, open a read-only Ticket Detail screen, and add or soft-remove
attachments on a ticket they own — all on the Zen Green visual system, without any real authentication,
IT Staff workflow, or ticket-lifecycle features beyond the initial `NEW` status.

## 2. Stakeholder Request Interpretation

IT wants a professional, responsive intake experience for end users before real login exists. A Requester must
describe a problem (category, related system, priority, summary, description), attach evidence, and submit.
After submission they must be able to find that ticket again, search/filter/sort/paginate their own list, open
it for review, and manage their own attachments — with strict isolation from every other Requester's tickets.
Because authentication is a Lab 3 concern, Lab 2 substitutes a "Development Requester Selection" screen that
lets the tester pick one of several seeded Requesters as the acting identity for the session. This selector is
explicitly a test harness, not a security boundary in disguise.

## 3. Scope

### Included

- Development Requester Selection screen (seeded, active Requesters only) and in-app Requester context
  (display + "Change Requester").
- Create Ticket: category, related system, requested priority, summary, description, attachments (0–5,
  JPG/JPEG/PNG/WEBP/PDF, ≤5 MB each), backend-generated Ticket Number, initial status `NEW`.
- My Tickets: paginated list scoped to the current Requester, search, category/priority/status filters,
  column sorting, empty state, no-results state, failure state.
- Requester Ticket Detail (view mode): read-only ticket fields, attachment list (active + removed metadata),
  add attachment, download an active attachment, soft-remove an owned attachment with a reason.
- Ownership enforcement on every ticket/attachment read and write (backend, not just UI hiding).
- Zen Green theme tokens and reusable form/list/badge/validation/loading/empty/error/responsive conventions.
- Prisma schema, idempotent seed data, and REST API needed to support all of the above.

### Excluded

- Authentication and security: real login, logout, passwords, sessions, tokens, role-based authorization.
  The Development Requester selector is a testing convenience only.
- IT Staff workflow: staff dashboard/queue, claiming/reassigning tickets, IT Priority changes.
- Ticket collaboration and work tracking: Public Comments, Internal Notes, Actions Taken.
- Ticket lifecycle beyond creation: any status transition away from `NEW` (resolving, closing, reopening,
  cancelling) and resolution confirmation.
- Administration functions: managing users, Requesters, roles, or reference data through the UI.

## 4. Functional Requirements

- FR-01 The system shall present a Development Requester Selection screen before any ticket screen is
  reachable, listing only active Requesters loaded from PostgreSQL.
- FR-02 The system shall store the selected Requester as the acting identity for the session and expose it in
  the application shell with a "Change Requester" action.
- FR-03 The system shall reload all Requester-scoped data whenever the acting Requester changes.
- FR-04 The system shall let the acting Requester submit a new ticket with category, related system, requested
  priority, summary, and description, validated on both client and server.
- FR-05 The system shall let the acting Requester attach 0–5 permitted files to a ticket during creation.
- FR-06 The system shall generate a unique, backend-assigned Ticket Number and initial status `NEW` for every
  successfully created ticket and return it to the client.
- FR-07 The system shall preserve entered form values when ticket creation fails so the Requester does not
  re-type the form.
- FR-08 The system shall list only the acting Requester's own tickets in My Tickets.
- FR-09 The system shall let the acting Requester search their tickets by ticket number or summary text.
- FR-10 The system shall let the acting Requester filter their tickets by category, requested priority, and
  current status.
- FR-11 The system shall let the acting Requester sort their ticket list by at least created date and ticket
  number, ascending or descending.
- FR-12 The system shall paginate the ticket list and expose page metadata (current page, page size, total
  count, total pages).
- FR-13 The system shall distinguish an empty list (Requester has zero tickets) from a no-results list
  (filters/search matched nothing).
- FR-14 The system shall let the acting Requester open a Ticket Detail screen for a ticket they own, showing
  all ticket fields as read-only.
- FR-15 The system shall reject a Ticket Detail or Attachment request for a ticket the acting Requester does
  not own, without leaking the other Requester's data.
- FR-16 The system shall let the acting Requester add a permitted attachment to an existing owned ticket,
  subject to the 5-active-attachment cap.
- FR-17 The system shall let the acting Requester download an active attachment on an owned ticket.
- FR-18 The system shall let the acting Requester soft-remove an active attachment on an owned ticket by
  supplying a removal reason.
- FR-19 The system shall keep a soft-removed attachment's metadata visible in the UI but block its download
  or preview.
- FR-20 The system shall show clear loading, empty, no-results, validation-error, and API-failure states on
  every screen in scope.

## 5. Business Rules

| ID | Rule |
|---|---|
| BR-01 | The official Ticket Number is generated by the backend and is globally unique. Format: `TKT-{yyyy}-{sequence}`, where `sequence` is a zero-padded, per-year monotonically increasing integer (e.g. `TKT-2026-000001`). |
| BR-02 | A new Ticket always begins with Current Status `NEW`. No other status is reachable in Lab 2. |
| BR-03 | Lab 2 uses a Development Requester selector instead of login. The selected identity is a testing mechanism only and confers no real authentication or authorization. |
| BR-04 | Only Requesters with `isActive = true` are offered in the Development Requester Selection dropdown. |
| BR-05 | An inactive Requester's existing tickets remain in the database but that Requester cannot be selected as the acting identity. |
| BR-06 | Changing the acting Requester immediately invalidates any previously loaded ticket list/detail data in the UI; new data is fetched under the new identity. |
| BR-07 | Every Ticket belongs to exactly one Requester (`requesterId`), set at creation from the acting Requester and never editable afterward. |
| BR-08 | A Requester may retrieve, list, or modify only Tickets and Attachments where `ticket.requesterId` equals the acting Requester's id. The check is enforced server-side on every read and write. |
| BR-09 | `Ticket Owner` (IT Staff assignee) is out of scope for Lab 2 and is stored as `null`/unassigned on every ticket. |
| BR-10 | `IT Priority` is out of scope for Lab 2 and is stored as `null` on every ticket; the UI displays it as "Not yet triaged" rather than a priority badge. |
| BR-11 | Ticket Summary is required, trimmed of leading/trailing whitespace, and must be 5–120 characters after trimming. |
| BR-12 | Ticket Description is required, trimmed, and must be 10–2000 characters after trimming. |
| BR-13 | Category and Related System are required and must reference an existing, active reference row; an inactive or unknown id is rejected. |
| BR-14 | Requested Priority is required and must be one of `LOW`, `MEDIUM`, `HIGH`. |
| BR-15 | Ticket Number, Ticket Date, Current Status, Ticket Owner, and IT Priority are system-generated/read-only and are never accepted from client input on create. |
| BR-16 | The Create Ticket submit action is disabled while a request is in flight, preventing duplicate submissions from repeated clicks. |
| BR-17 | If ticket creation fails validation, no Ticket row and no Attachment rows are persisted, and the submitted field values (excluding file contents) remain in the form. |
| BR-18 | If the Ticket row is created successfully but one or more attachment uploads fail, the Ticket is still saved; failed files are reported individually and the Requester may retry adding them from Ticket Detail. Ticket creation is not rolled back for attachment failures. |
| BR-19 | Allowed attachment types are JPG, JPEG, PNG, WEBP, and PDF, checked by both file extension and MIME type. Any other type is rejected before storage. |
| BR-20 | Maximum attachment size is 5 MB per file; oversized files are rejected before storage. |
| BR-21 | A Ticket may have at most 5 **active** (non-removed) Attachments at any time; a removed attachment does not count against the cap. |
| BR-22 | Attachment removal is a soft removal: the row is flagged `isRemoved = true` with `removedAt` and `removalReason`; the underlying file and metadata row are never physically deleted in Lab 2. |
| BR-23 | Only the owning Requester may soft-remove an attachment, and only while it is currently active (not already removed). |
| BR-24 | A soft-removed attachment remains visible in the UI as metadata (original filename, size, type, removed date, reason) but its download/preview endpoint returns a not-found/forbidden response, never the file bytes. |
| BR-25 | Uploaded files are stored under a generated, collision-safe stored filename; the Requester-supplied original filename is kept only as display metadata and is never used as a filesystem path. |
| BR-26 | The My Tickets search matches ticket number (exact/partial) or summary text (case-insensitive, partial match) for the acting Requester's own tickets only. |
| BR-27 | The My Tickets list defaults to sorting by created date, newest first, when no sort is specified. |
| BR-28 | The My Tickets page size defaults to 10 and accepts only a fixed set of permitted values (10, 20, 50); any other requested value falls back to the default rather than erroring. |
| BR-29 | An out-of-range page number returns an empty result set with correct pagination metadata rather than an error. |
| BR-30 | When Lab 3 introduces real authentication, the Development Requester Selection screen and its `RequesterUser` seed identity are expected to be replaced by an authenticated user's own identity; `requesterId` on Ticket/Attachment is designed to map directly onto the future authenticated user id without a schema change. |

## 6. UI Specification Summary

Full detail lives in `ui-spec.md`. Summary of scope:

- **Application shell**: TokTickIT brand mark, "My Tickets" / "Create Ticket" navigation, active-page
  indication, current Requester display with "Change Requester", responsive collapsed nav on mobile.
- **Development Requester Selection**: dropdown of active Requesters, explanatory "testing only" copy,
  Continue action, loading/empty/failure states, keyboard-accessible.
- **Create Ticket**: grouped read-only system fields, classification fields (Category, Related System,
  Requested Priority), full-width Summary/Description, Attachments picker below, primary Submit + secondary
  Cancel, inline validation messages, busy-state Submit, success state showing the generated Ticket Number.
- **My Tickets**: search box, filter row (Category, Requested Priority, Current Status), sortable columns,
  Create Ticket action, desktop table / mobile card layout, pagination controls, empty vs. no-results states.
- **Requester Ticket Detail**: read-only field groups, Attachments panel (active + removed, upload control,
  soft-remove with reason dialog), back navigation to My Tickets.
- All screens follow the Zen Green palette and the shared badge/field/validation/loading/empty/error
  conventions defined in `ui-spec.md`.

## 7. Data Changes

Prisma models added/extended for Lab 2 (full column list, indexes, and constraints in `ui-spec.md`/
`api-spec.md` cross-references and the committed `prisma/schema.prisma`):

- **RequesterUser** — id, name, email (unique), isActive, createdAt. Seed: 4+ active, 1+ inactive.
- **Category** — existing Lab 1 model, reused unchanged (id, name unique, createdAt).
- **RelatedSystem** — id, name (unique), isActive, createdAt. Seed: 6+ rows (Email, Campus Wi-Fi, VPN,
  LEB2 App, Grade Submission App, Corporate Laptop, Printer).
- **Ticket** — id, ticketNumber (unique), requesterId (FK → RequesterUser), categoryId (FK → Category),
  relatedSystemId (FK → RelatedSystem), summary, description, requestedPriority (enum), itPriority (enum,
  nullable, unused in Lab 2), currentStatus (enum, always `NEW` in Lab 2), ticketOwnerId (nullable, unused in
  Lab 2), createdAt, updatedAt.
- **Attachment** — id, ticketId (FK → Ticket), originalFileName, storedFileName, mimeType, fileSizeBytes,
  isRemoved (default false), removedAt (nullable), removalReason (nullable), uploadedAt.
- **Enums** — `Priority` (LOW, MEDIUM, HIGH); `TicketStatus` (NEW, OPEN, IN_PROGRESS, RESOLVED, CLOSED,
  CANCELLED — only `NEW` is producible in Lab 2; remaining values reserved for later labs).

Relationships: one RequesterUser → many Tickets; one Ticket → many Attachments; one Category → many Tickets;
one RelatedSystem → many Tickets. Indexes: unique on `ticketNumber` and `RequesterUser.email`; foreign-key
indexes on `Ticket.requesterId`, `Ticket.categoryId`, `Ticket.relatedSystemId`, `Attachment.ticketId`; a
composite index on `(requesterId, createdAt)` to support the default My Tickets sort/filter/pagination query.

## 8. API Contract

Full endpoint-by-endpoint contract lives in `api-spec.md`. Capabilities covered: active Categories, active
Related Systems, active Requesters, create Ticket, list own Tickets (search/filter/sort/paginate), get one
owned Ticket, upload Attachment, get Attachment metadata, download an active Attachment, soft-remove an
Attachment. All endpoints that read or write a Ticket/Attachment enforce ownership against the
`x-requester-id` header sent by the client (the Lab 2 substitute for a session — see `api-spec.md` §0).

## 9. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-01 | Given valid ticket data, when the Requester submits Create Ticket, then one Ticket is saved with status `NEW` and the response/UI shows the backend-generated Ticket Number. |
| AC-02 | Given no Development Requester is selected, when the user tries to open My Tickets, Create Ticket, or Ticket Detail directly, then they are redirected to the Development Requester Selection screen. |
| AC-03 | Given Requester B is selected, when a Ticket belonging to Requester A is requested by id, then no ticket data is returned and a not-found/forbidden response is given. |
| AC-04 | Given the Summary field is left blank, when the Requester submits, then a field-level error appears under Summary and no API request is sent. |
| AC-05 | Given the Description is 5 characters after trimming, when the Requester submits, then a field-level "too short" error appears under Description and no API request is sent. |
| AC-06 | Given a 6 MB JPG file is selected, when the Requester attempts to attach it, then the file is rejected with a size error and is not added to the pending attachment list. |
| AC-07 | Given a `.exe` file is selected, when the Requester attempts to attach it, then the file is rejected with a file-type error and is not added to the pending attachment list. |
| AC-08 | Given 5 active attachments already exist on a ticket, when the Requester attempts to add a 6th, then the upload is rejected and the existing 5 remain active. |
| AC-09 | Given the backend is unreachable, when the Requester submits a valid Create Ticket form, then a safe failure message is shown and all entered field values remain in the form. |
| AC-10 | Given the Requester double-clicks Submit, when the first request is still in flight, then the button is disabled/busy and only one Ticket is created. |
| AC-11 | Given Requester A has 3 tickets and Requester B has 2, when Requester A opens My Tickets, then exactly Requester A's 3 tickets are listed. |
| AC-12 | Given the acting Requester is changed from A to B in the shell, when My Tickets re-renders, then Requester A's tickets are no longer visible and Requester B's tickets load instead. |
| AC-13 | Given a search term matching an existing ticket's summary, when the Requester searches, then only matching tickets for the acting Requester are shown. |
| AC-14 | Given a search term matching no ticket, when the Requester searches, then a no-results state is shown, distinct from the empty-list state. |
| AC-15 | Given a Requester with zero tickets, when they open My Tickets with no filters applied, then an empty-list state with a Create Ticket call-to-action is shown. |
| AC-16 | Given filters for Category="Hardware" and Status="NEW", when applied, then only the acting Requester's Hardware/NEW tickets are listed. |
| AC-17 | Given more tickets than one page size, when the Requester changes page, then a different, correctly-scoped slice of their own tickets is shown and pagination metadata updates accordingly. |
| AC-18 | Given the ticket list is sorted by Ticket Number descending, when applied, then the returned order matches that sort for the acting Requester's tickets. |
| AC-19 | Given the ticket API is unreachable, when My Tickets loads, then a safe failure state with a retry option is shown instead of a blank or crashed screen. |
| AC-20 | Given the acting Requester owns a ticket, when they open its Ticket Detail, then all ticket fields render as read-only with correct values. |
| AC-21 | Given the acting Requester owns a ticket with 2 active attachments, when they open Ticket Detail, then both attachments are listed with correct metadata and a working download action. |
| AC-22 | Given the acting Requester owns a ticket with fewer than 5 active attachments, when they add one permitted file, then it appears immediately as an active attachment. |
| AC-23 | Given the acting Requester soft-removes an active attachment with a reason, when the removal completes, then the attachment shows as "Removed" with the reason retained, and its download control is disabled. |
| AC-24 | Given an attachment has been soft-removed, when a download of that attachment id is attempted (including by direct API call), then the file bytes are never returned. |
| AC-25 | Given Requester B is the acting identity, when they attempt to add, download, or remove an attachment on a ticket owned by Requester A (including by direct API call), then the action is rejected. |
| AC-26 | Given the app is viewed at a mobile viewport (<768px), when My Tickets is open, then the list renders as stacked cards with no horizontal page scrolling and all actions remain reachable. |
| AC-27 | Given the app is viewed at a tablet viewport (768–991px), when Create Ticket is open, then Summary and Description retain sufficient width and no field label is clipped. |
| AC-28 | Given a keyboard-only user, when they tab through Create Ticket, then every control (including the Requester Selection dropdown and Continue button) is reachable and shows a visible focus indicator. |
| AC-29 | Given the Development Requester list is empty (no active Requesters seeded), when the Selection screen loads, then a clear empty state is shown instead of a blank dropdown. |
| AC-30 | Given the Requesters API fails, when the Selection screen loads, then a safe failure state is shown instead of an unhandled error. |

Every AC above maps to at least one row in `tests.md` §2 and §3.

## 10. Definition of Done

Product completion (before the coding agent may report "done" on any Lab 2 issue):

- All in-scope screens/APIs listed in §3 "Included" are implemented and match `ui-spec.md`/`api-spec.md`.
- Every Acceptance Criterion in §9 has at least one passing, traceable automated test (see `tests.md`).
- No required test is skipped, disabled, or commented out; `npm test` is green in `server/` and `client/`,
  and the Playwright suite (added in Issue 7) is green, all from the final `lab2-staging`/`main` branch.
- Ownership checks are enforced server-side for every ticket/attachment read and write, not only hidden in
  the UI (covered by AC-03, AC-25 and their API-level tests).
- All validation, loading, empty, no-results, and failure states specified in §9 render as specified, verified
  by screenshots at desktop/tablet/mobile per `ui-spec.md` §"Responsive Requirements".
- The Prisma seed script is idempotent (safe to re-run without duplicating rows).
- README setup/test instructions are current for the Lab 2 increment.
- This specification, `tests.md`, `ui-spec.md`, and `api-spec.md` remain internally consistent with the
  merged implementation; any deviation is reflected back into these documents before Issue 7 closes.

Course delivery (checked separately, see `reviewer.md`/`ai-use.md`): GitHub Issues driven work, one feature
branch per issue merged via reviewed PR into `lab2-staging`, then one release PR from `lab2-staging` to `main`.

## 11. Assumptions and Decisions

- **IT Priority / Ticket Owner storage**: modeled as nullable columns on `Ticket` now (rather than added in a
  later migration) so Lab 3's IT Staff workflow does not require a schema-breaking change; both remain
  `null` and hidden behind "Not yet triaged"/"Unassigned" copy for the entire Lab 2 scope (BR-09, BR-10).
- **Session substitute**: since no auth exists yet, the acting Requester id is sent by the client as an
  `x-requester-id` request header (not a cookie/JWT) on every Requester-scoped API call; the backend still
  independently validates that id is active and owns the resource. This keeps the mechanism explicitly
  temporary and easy to delete in Lab 3 (BR-03, BR-08).
- **Ticket Number format**: `TKT-{yyyy}-{6-digit sequence}` was chosen to match the illustrative screenshot
  in the handout (`TKT-2025-001234`) while guaranteeing per-year uniqueness via a database sequence/count.
- **Attachment storage**: local disk storage under a generated UUID-based filename for Lab 2 (no cloud
  storage dependency); the `originalFileName` is retained purely as UI metadata (BR-25).
- **Routing**: the client currently has no router; Issue 3 introduces `react-router-dom` to support the
  Requester Selection, My Tickets, Create Ticket, and Ticket Detail routes required by this spec.
- **Field length limits** (BR-11, BR-12) are not specified by the handout; 5–120 chars for Summary and
  10–2000 chars for Description were chosen to keep the list view readable while allowing a real problem
  description, and are enforced identically on client and server.
- **Ticket Detail attachments**: `api-spec.md` §2 originally listed `GET /api/tickets/:id` as returning only
  ticket fields plus `categoryName`/`relatedSystemName`, with no separate endpoint to list a ticket's
  attachments. Since the Ticket Detail Attachments panel (FR-14, ui-spec.md §4.5) needs the full active +
  removed list, Issue 6 extends that response with an `attachments` array (each entry shaped like
  `GET /api/attachments/:id`) instead of adding a second round-trip endpoint. `api-spec.md` has been updated
  to reflect this as the current contract.
