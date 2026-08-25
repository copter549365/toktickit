# Lab 2 Test Plan and Results

Status: Planned (Issue 1 — Spec-DD). No implementation exists yet; every row below is written before code so
Issues 2–7 write failing tests first (TDD) against this plan. `Final` results are filled in as each feature
issue lands, and the full run is confirmed in Issue 7.

## 1. Test Strategy

- **Unit**: pure logic with no I/O — Ticket Number generation, validation helpers, query-parameter
  normalization (page/pageSize/sort fallbacks).
- **API/Integration**: Supertest against the Express app + a real test PostgreSQL database (migrated +
  seeded), covering every endpoint in `api-spec.md`, including ownership and error paths.
- **UI component**: Vitest + Testing Library for form validation, busy states, badge rendering, empty/error
  states, in isolation from the network via mocked fetch.
- **UI style / visual**: assertions on required CSS classes/field states + Playwright screenshots at desktop/
  tablet/mobile, checked against `ui-spec.md` §8.
- **Responsive**: Playwright viewport runs (≥992px, 768–991px, <768px) confirming layout rules in
  `ui-spec.md` §6.
- **E2E**: Playwright, full Requester journey across Requester Selection → Create Ticket → My Tickets →
  Ticket Detail → Attachment lifecycle, including a cross-Requester isolation check.

Every row below traces to one or more Acceptance Criteria (`specification.md` §9) and names its real test
file path, per the required repository structure.

## 2. Planned Tests

| Test ID | Type | AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-01 | Ticket Number generator produces `TKT-{yyyy}-{6 digits}` and increments per year | Format matches regex; sequential calls increment | `server/tests/lab-02/ticket-number.unit.test.ts` | Planned |
| UNIT-02 | Unit | AC-04, AC-05 | Summary/Description validators enforce length + trimming rules (BR-11, BR-12) | Reject out-of-range/blank; accept boundary values (5, 120, 10, 2000 chars) | `server/tests/lab-02/validation.unit.test.ts` | Planned |
| UNIT-03 | Unit | AC-17 | Ticket-list query normalizer applies default/fallback for invalid `sortBy`, `sortOrder`, `page`, `pageSize` | Invalid values fall back to documented defaults, never throw | `server/tests/lab-02/ticket-query.unit.test.ts` | Planned |
| API-01 | API | AC-01 | `POST /api/tickets` with valid body | 201; ticket persisted with `NEW` status and unique Ticket Number | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-02 | API | AC-04 | `POST /api/tickets` missing Summary | 400 with `fieldErrors.summary`; no row persisted | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-03 | API | AC-05 | `POST /api/tickets` Description too short | 400 with `fieldErrors.description`; no row persisted | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-04 | API | — (BR-13) | `POST /api/tickets` with unknown `categoryId` | 400 `INVALID_REFERENCE` | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-05 | API | — (§0) | `POST /api/tickets` missing `x-requester-id` | 400 `MISSING_REQUESTER_CONTEXT` | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-06 | API | — (BR-04, §0) | `POST /api/tickets` with an inactive Requester's id | 401 `INVALID_REQUESTER_CONTEXT` | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-07 | API | AC-11 | `GET /api/tickets` for Requester A only returns A's tickets, even when B has tickets too | Response contains only A's rows | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-08 | API | AC-13 | `GET /api/tickets?search=` matches ticket number/summary | Only matching, owned tickets returned | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-09 | API | AC-14 | `GET /api/tickets?search=` with no matches | `data: []`, `meta.totalCount: 0` | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-10 | API | AC-16 | `GET /api/tickets?categoryId=&currentStatus=` combined filters | Only rows matching both filters, still owner-scoped | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-11 | API | AC-17 | `GET /api/tickets?page=2&pageSize=10` beyond available rows | `data: []`, valid `meta` (BR-29) | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-12 | API | AC-18 | `GET /api/tickets?sortBy=ticketNumber&sortOrder=desc` | Rows ordered descending by ticket number | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-13 | API | — (BR-28) | `GET /api/tickets?pageSize=999` | Falls back to default page size 10, not an error | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-14 | API | AC-20 | `GET /api/tickets/:id` for an owned ticket | 200 with full read-only field set | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-15 | API | AC-03 | `GET /api/tickets/:id` for a ticket owned by another Requester | 404 `TICKET_NOT_FOUND` (no leak) | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-16 | API | — | `GET /api/tickets/:id` for a nonexistent id | 404 `TICKET_NOT_FOUND`, identical shape to API-15 | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-17 | API | AC-22 | `POST /api/tickets/:id/attachments` valid JPG under 5 MB, owned ticket, <5 active | 201; attachment `isRemoved:false` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-18 | API | AC-07 | `POST /api/tickets/:id/attachments` with a `.exe` file | 415 `UNSUPPORTED_FILE_TYPE`; not persisted | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-19 | API | AC-06 | `POST /api/tickets/:id/attachments` with a 6 MB file | 413 `FILE_TOO_LARGE`; not persisted | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-20 | API | AC-08 | `POST /api/tickets/:id/attachments` on a ticket with 5 active attachments already | 409 `ATTACHMENT_LIMIT_REACHED`; count stays 5 | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-21 | API | AC-25 | `POST /api/tickets/:id/attachments` where `:id` belongs to another Requester | 404 `TICKET_NOT_FOUND` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-22 | API | AC-21 | `GET /api/attachments/:id/download` for an active, owned attachment | 200, correct `Content-Type`/`Content-Disposition`, bytes match uploaded file | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-23 | API | AC-24 | `GET /api/attachments/:id/download` for a soft-removed attachment | 404 `ATTACHMENT_NOT_FOUND`; no bytes returned | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-24 | API | AC-25 | `GET /api/attachments/:id/download` for an attachment on another Requester's ticket | 404 `ATTACHMENT_NOT_FOUND` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-25 | API | AC-23 | `DELETE /api/attachments/:id` with a valid reason on an owned, active attachment | 200; `isRemoved:true`, `removalReason` stored | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-26 | API | — (BR-23) | `DELETE /api/attachments/:id` missing `removalReason` | 400 `REMOVAL_REASON_REQUIRED` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-27 | API | — (BR-23) | `DELETE /api/attachments/:id` already removed | 409 `ATTACHMENT_ALREADY_REMOVED` | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-28 | API | AC-25 | `DELETE /api/attachments/:id` on another Requester's attachment | 404 `TICKET_NOT_FOUND`-equivalent for attachments | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-29 | API | — | `GET /api/requesters` returns only active Requesters | Seeded inactive Requester absent from response | `server/tests/lab-02/requesters.api.test.ts` | Pass |
| API-30 | API | — | `GET /api/related-systems` returns only active rows | Matches seed | `server/tests/lab-02/related-systems.api.test.ts` | Planned |
| DB-01 | DB | — | Idempotent seed for RequesterUser/RelatedSystem/Category/Ticket-adjacent lookups | Running seed twice creates no duplicate rows | `server/tests/lab-02/seed.test.ts` | Planned |
| UI-01 | UI | AC-02, AC-29, AC-30 | Requester Selection screen: loading, loaded, empty, and API-failure states | Correct state renders for each mocked fetch outcome | `client/tests/lab-02/RequesterSelection.test.tsx` | Pass |
| UI-02 | UI | AC-04, AC-05 | Create Ticket blocks submit and shows field errors for blank Summary / short Description | Field-level message shown; `fetch` not called | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-03 | UI | AC-06, AC-07 | Create Ticket attachment picker rejects oversized/wrong-type files client-side | Inline per-file error; file not added to pending list | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-04 | UI | AC-10 | Submit button shows busy state and is disabled while POST is in flight | Second click during flight does not trigger a second request | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-05 | UI | AC-01 | Successful submission displays the backend-returned Ticket Number | Success panel shows exact returned value | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-06 | UI | AC-09 | Create Ticket on API failure preserves entered field values | Form retains previously typed Summary/Description after error | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-07 | UI | AC-15, AC-14 | My Tickets renders Empty state vs. No-results state distinctly | Correct copy/CTA for each mocked response | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-08 | UI | AC-12 | My Tickets re-fetches when the acting Requester context changes | New fetch fired with new `x-requester-id`; old rows cleared before new render | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-09 | UI | AC-17, AC-18 | My Tickets pagination and sort controls update query params and re-render | Clicking next page / column header issues expected fetch call | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-10 | UI | AC-19 | My Tickets API-failure state shows retry, not a blank/crashed screen | Error banner + Retry button rendered | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-11 | UI | AC-20, AC-21 | Ticket Detail renders read-only fields and attachment list from API data | All fields non-editable; attachments listed with correct metadata | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Planned |
| UI-12 | UI | AC-22 | Attachment section: add a valid file to a ticket with <5 active attachments | New attachment appears active immediately after success response | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-13 | UI | AC-23 | Attachment section: soft-remove flow requires a reason before confirming | Confirm disabled until reason entered; DELETE called with reason on confirm | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-14 | UI | AC-24 | Attachment section: removed attachment shows disabled download with explanation | Download control disabled, tooltip/message present | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-15 | UI | — (ui-spec §3) | Badge components render correct color+text for each Priority/Status value | Snapshot/class assertions match `ui-spec.md` §3 table | `client/tests/lab-02/Badges.test.tsx` | Planned |
| STYLE-01 | UI Style | AC-28, ui-spec §7 | Required-field asterisk + `role="alert"` validation message present on invalid fields | Assertions on DOM attributes/classes across Create Ticket fields | `client/tests/lab-02/FormAccessibility.test.tsx` | Planned |
| RESP-01 | Responsive | AC-26 | My Tickets at <768px renders stacked cards, no horizontal scroll | Playwright viewport screenshot + `scrollWidth` check | `e2e/lab-02/responsive-my-tickets.spec.ts` | Planned |
| RESP-02 | Responsive | AC-27 | Create Ticket at 768–991px keeps Summary/Description full width, no clipped labels | Playwright viewport screenshot + layout assertions | `e2e/lab-02/responsive-create-ticket.spec.ts` | Planned |
| RESP-03 | Responsive | ui-spec §6 | Ticket Detail at all three breakpoints matches `ui-spec.md` visual checklist | Screenshots saved to `artifacts/lab-02/screenshots/ticket-detail/` | `e2e/lab-02/responsive-ticket-detail.spec.ts` | Planned |
| E2E-01 | E2E | AC-01, AC-02 | Select a Development Requester, create a valid ticket, see the generated Ticket Number | Full flow completes; number matches what My Tickets later shows | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-02 | E2E | AC-11, AC-12 | Create a ticket as Requester A, switch to Requester B, confirm A's ticket is not visible, switch back and confirm it is | Isolation holds in both directions | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-03 | E2E | AC-22, AC-23, AC-24 | Open a created ticket, add an attachment, soft-remove it with a reason, confirm download is blocked | Full attachment lifecycle observable end-to-end | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-04 | E2E | AC-13, AC-16, AC-17 | Create several tickets, then search + filter + paginate My Tickets to find one | Correct subset found at each step | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-05 | E2E | AC-28 | Keyboard-only pass through Requester Selection → Create Ticket submit | Every control reachable via Tab, focus visible, form submittable without a mouse | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, UI-05, E2E-01 |
| AC-02 | UI-01, E2E-01 |
| AC-03 | API-15 |
| AC-04 | API-02, UNIT-02, UI-02 |
| AC-05 | API-03, UNIT-02, UI-02 |
| AC-06 | API-19, UI-03 |
| AC-07 | API-18, UI-03 |
| AC-08 | API-20 |
| AC-09 | UI-06 |
| AC-10 | UI-04 |
| AC-11 | API-07, E2E-02 |
| AC-12 | UI-08, E2E-02 |
| AC-13 | API-08, E2E-04 |
| AC-14 | API-09, UI-07 |
| AC-15 | UI-07 |
| AC-16 | API-10, E2E-04 |
| AC-17 | API-11, UNIT-03, UI-09, E2E-04 |
| AC-18 | API-12, UI-09 |
| AC-19 | UI-10 |
| AC-20 | API-14, UI-11 |
| AC-21 | UI-11, API-22 |
| AC-22 | API-17, UI-12, E2E-03 |
| AC-23 | API-25, UI-13, E2E-03 |
| AC-24 | API-23, UI-14, E2E-03 |
| AC-25 | API-21, API-24, API-28 |
| AC-26 | RESP-01 |
| AC-27 | RESP-02 |
| AC-28 | STYLE-01, E2E-05 |
| AC-29 | UI-01 |
| AC-30 | UI-01 |

Every AC-01..AC-30 has at least one row above; no orphaned criteria.

## 4. Responsive and Visual Checklist

See `ui-spec.md` §8 for the full checklist; RESP-01/02/03 and E2E screenshots are the evidence source.
Screenshot paths follow `ui-spec.md` §9 (`artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`).

## 5. Test Commands

```bash
# Server (unit + API/integration)
cd server && npm test

# Client (UI component + style)
cd client && npm test

# E2E + responsive (added in Issue 7)
npx playwright test e2e/lab-02
```

## 6. Final Results

Not yet run in full — implementation is in progress. This section is updated as Issues 2–7 land, with the
final consolidated pass/fail output filled in before the Issue 7 release PR.

- **Issue 3** (Development Requester Selection & Context Management): API-29 and UI-01 pass — see rows above.
  `GET /api/related-systems` (API-30) is deferred to Issue 4, which is the first issue that consumes it.

## 7. Known Limitations or Deferred Tests

- Load/performance testing is out of scope for Lab 2.
- Cross-browser E2E is limited to the Playwright default (Chromium) project; multi-browser matrices are
  deferred to a later lab if required.
- File-storage failure injection (e.g. disk full) is not covered — only application-level validation
  failures (type/size/limit) are tested.
