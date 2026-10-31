# Lab 4 Zen Green UI Specification

This document extends [../lab-03/ui-spec.md](../lab-03/ui-spec.md). The Lab 3 color tokens, typography, badges (role, priority, and Ticket status), field states, buttons, breakpoints, and accessibility rules remain **unchanged and mandatory**. This document covers only what Lab 4 adds or changes. Rule and criterion IDs refer to [specification.md](./specification.md).

---

## 1. New Tokens and Badges

### 1.1. Action Taken Status Badges
Each badge pairs color with a text label and an icon glyph, so color is never the only cue.

| Status | Label | Background | Text | Icon |
|---|---|---|---|---|
| `PLANNED` | Planned | `#F1F5F9` | `#334155` | ○ (outline circle) |
| `IN_PROGRESS` | In Progress | `#DBEAFE` | `#1D4ED8` | ◐ |
| `COMPLETED` | Completed | `#DCFCE7` | `#15803D` | ✓ |
| `CANCELLED` | Cancelled | `#F3F4F6` | `#4B5563` | ✕, label also struck through |

### 1.2. Content-Visibility Tags
| Tag | Used on | Style |
|---|---|---|
| **Visible to Requester** | Actions Taken section header, Public Comments | `--color-pale` fill, `--color-primary` text, eye icon |
| **Confidential: Staff only** | Internal Notes (Lab 3) | amber border `--color-warning`, lock icon (unchanged) |

### 1.3. Follow-up Indicator
An amber pill reading "Follow-up required" (`--color-warning-pale` background, `--color-warning` text, flag icon). It appears on the action row and in the Resolve modal warnings.

### 1.4. Metric Card
- `--color-surface` background, 1px `--color-border`, 8px radius, and the Lab 3 card shadow.
- Label: 14px, `--color-text-muted`. Value: 32px, weight 600, `--color-text`. Footer link: "View all →" in `--color-secondary`.
- The whole card is a single `<a>` element with an accessible name of the form "{label}: {value}. View tickets".
- Hover: border `--color-secondary`. Focus: the Lab 3 focus ring.
- Zero value: shows `0` with the muted helper text "Nothing here right now". The card is still clickable (BR-25).
- No trend arrows or "from yesterday" deltas (spec §3.2).

---

## 2. Application Shell Changes (FR-17)

| Role | Navigation (left to right) |
|---|---|
| Requester | `Dashboard` · `My Tickets` · `Create Ticket` |
| IT Staff | `Dashboard` · `Ticket Queue` |
| Administrator | `Dashboard` · `Ticket Queue` · `User Management` |

- The active item has a 3px white bottom border and `aria-current="page"`.
- `/` and the post-login redirect go to `/dashboard`, which renders the role's dashboard.
- The mobile collapsed navigation is unchanged from Lab 3.
- **Removed:** the Lab 3 `AuthenticatedHome` per-role redirects and any leftover Lab 2 development text or links (FR-22).

---

## 3. Requester Dashboard (`/dashboard`, role Requester)

```
┌ Welcome, {firstName}!                                   [⟳ Refresh] ┐
│ Here's the latest on your requests.          Updated 12:10 (UTC+7)  │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│ My Open      │ Waiting for  │ Resolved     │ Closed                 │
│ Tickets  3   │ Me       1   │      2       │     12                 │
│ View all →   │ View all →   │ View all →   │ View all →             │
├──────────────┴──────────────┴──────┬───────┴────────────────────────┤
│ Needs My Attention        View all │ Quick Actions                  │
│  TKT-… summary  [Waiting] date     │  [+ Create Ticket]             │
│ Recently Updated          View all │  [▤ View My Tickets]           │
│ Recently Resolved                  │                                │
└────────────────────────────────────┴────────────────────────────────┘
```
- **Cards:** BR-22. Each one links to My Tickets with the filter applied. My Tickets shows the filter in its controls and the URL.
- **Lists:** each row shows the ticket number (link), summary (one line, ellipsis with the full text in `title`), status badge, and the updated date in Asia/Bangkok, e.g. "3 Nov 2026, 12:10".
  - Rows link to `/tickets/:id`.
  - In "Needs My Attention", rows in `WAITING_FOR_REQUESTER` show the hint "Staff are waiting for your reply". Rows in `RESOLVED` show "Please confirm the fix".
- **Empty state:** the cards show `0`. Each list shows its empty line, for example "No tickets need your attention." When the Requester has no Tickets at all, a single EmptyState replaces the lists with "You haven't created any tickets yet" and a [Create Ticket] button.

---

## 4. IT Staff and Administrator Dashboard (`/dashboard`, roles IT Staff and Administrator)

```
┌ Welcome back, {firstName}!                              [⟳ Refresh] ┐
│ Here's what's happening with the queue today.  Updated 12:10        │
├ Status ──────────────────────────────────────────────────────────────┤
│ New 4 │ Open 3 │ In Progress 5 │ Waiting for Requester 2 │ Reopened 1 │ Resolved 2 │
├ Workload ────────────────────────────────────────────────────────────┤
│ Unassigned 3 │ My Assigned 4 │ Marked Resolved by Requester 1 │ My Open Actions 2 │
├ IT Priority (active tickets) ── Low 4 · Medium 6 · High 5 ───────────┤
├──────────────────────────────────┬──────────────────────────────────┤
│ My Open Actions                  │ Urgent Tickets (High, oldest)    │
│  TKT-… · Collect VPN logs [Planned]│  TKT-… summary [In Progress]   │
│ Recently Updated        View all │ Quick Actions: [Ticket Queue]    │
│                                  │  [Unassigned tickets]            │
├ User Accounts (Admin only) ── Requesters 5 · IT Staff 4 · Admins 1 · Inactive 2 ┤
└──────────────────────────────────────────────────────────────────────┘
```
- **Cards:** BR-23 and BR-24. The IT Priority breakdown uses the Lab 3 priority badges inside each card, so the label is never color-only.
- **My Open Actions list:** ticket number, action description (one line), action status badge, action date, and the follow-up pill if set. A row links to `/staff/tickets/:ticketId#actions-taken`, which scrolls to the section and focuses its heading.
- **Urgent list:** ticket number, summary, status badge, owner (or an "Unassigned" pill), and age ("opened 3 days ago").
- **User Accounts:** shown only when the API returns `userAccounts` (Administrator). Each card links to User Management with the `role` and `isActive` filters applied (spec D-18).
- **Refresh:** re-fetches the data, disables itself while loading, and updates the "Updated hh:mm" time. Dashboards do not auto-poll.

---

## 5. Actions Taken (Ticket Detail)

### 5.1. Placement
- **Staff Ticket Detail:** a new section between Attachments and the Comments/Notes area, with `id="actions-taken"`. The heading reads "Actions Taken ({count})", followed by the **Visible to Requester** tag and an [+ Add Action] primary button.
- **Requester Ticket Detail:** the same section, read-only. It has no Add, Edit, or status controls, and no create form is rendered (not merely hidden).

### 5.2. List (view)
- **Desktop and tablet:** a table with columns Date/Time, Description, Result, Assignee, Performed by, Status, Follow-up, and an action column holding [View]. Staff also get [Edit] when the action is open.
  - Long text is clamped to 2 lines with an expand control ("Show more", a `button` with `aria-expanded`).
- **Mobile (< 768 px):** each action is a stacked card. It shows the date and status badge on top, then the description and result, then "Assignee · Performed by" and the follow-up pill, then the buttons at full width.
- **Order:** oldest `actionAt` first (BR-11). Editing an action never re-orders the list.
- **Empty:** "No actions recorded yet." Staff also see a secondary "Add the first action" button.

### 5.3. Create Mode (staff)
An inline form card opens directly under the section header. Focus moves to Description.

| Field | Control | Notes |
|---|---|---|
| Action Date/Time | `datetime-local`, defaults to now | Inline error if in the future or before the Ticket was created |
| Description* | textarea with a 0/2000 counter | |
| Status | segmented control: Planned / In Progress / Completed | Defaults to Planned |
| Result | textarea | Becomes required (marked with *) when Completed is selected |
| Assignee | select of active IT Staff and Admins (`GET /api/staff/users`), defaults to me | Server `INVALID_ASSIGNEE` errors are shown inline under the select |
| Follow-Up Required? | checkbox | |
| Follow-up Note* | textarea, shown only when the checkbox is checked | Required when shown. Unchecking hides it and its value is discarded. |
| Attachment Notes | input, with helper "Which file to look at, e.g. 'see screenshot error-03.png'" | |
| Performed by | read-only ivory field showing "Set automatically when completed" | Never editable |

- Buttons: [Save Action] (primary) and [Cancel] (secondary). Save shows a spinner and is disabled while busy.
- The form keeps one `clientRequestId` per draft. A retry after a network failure re-sends the same id (BR-20).
- On success the form closes, the list re-fetches, a success toast reads "Action added", and focus returns to the new row.
- On failure every typed value is kept (FR-21). Errors from `400` responses are placed under their fields, with `role="alert"`.

### 5.4. View and Edit Mode
- **[View]** opens a right-side drawer, or a full-screen sheet on mobile, showing every field read-only in ivory. It also shows Created by, Last updated by and time, Completed at, and Cancel reason (if any). It is a focus-trapped dialog, labeled by its title "Action #n".
- **[Edit]** (open actions only) switches the drawer to edit mode with the same fields as create. Status buttons follow BR-07:
  - [Start] when Planned.
  - [Mark Completed]: requires a Result and confirms inline.
  - [Cancel Action] (destructive): opens a modal asking for a reason of 5 or more characters.
- Locked actions show a "Completed actions are read-only" note instead of the Edit button.
- **Conflict (`409 STALE_UPDATE` or `ACTION_LOCKED`):** an amber banner at the top of the drawer reads "Someone else updated this action. Your changes are kept below." with [Reload latest] and [Discard my changes]. Reload fetches the new version, keeps the user's draft side by side, and lets them save again.

---

## 6. Ticket Workflow UI

### 6.1. Status Control
- A select or button group listing **only** `permittedNextStatuses` from the API. If the list is empty, a read-only status badge shows with the text "No further changes".
- Transitions that need confirmation (spec BR-13) open the Lab 3 modal. Every modal is focus-trapped, closes with Esc, and returns focus to its trigger.

### 6.2. Resolve Modal
```
Resolve ticket TKT-2026-000010
 ✓ Ticket has an owner
 ✓ At least one action is completed
 ✗ No planned or in-progress actions remain  — 1 open action: "Collect VPN logs" [Go to action]
 ⚑ 1 completed action requires follow-up
Resolution summary*  [                                   ]
                       [Cancel]  [Resolve ticket] (disabled while any ✗)
```
- The checklist uses ✓, ✗, and ⚑ icons together with text, so it is never color-only.
- Even with the button enabled, the server may still answer `409 RESOLUTION_GATE_NOT_MET`, for example because another user added an action in the meantime. The modal then refreshes the checklist from the error body and keeps the summary text.

### 6.3. After a Successful Change
The status badge, `version`, permitted list, Status History, and Actions Taken (which may have been auto-cancelled) refresh without a page reload. A success toast reads "Status changed to Resolved".

### 6.4. Status History
- A collapsible "Status History" timeline appears on both detail screens, oldest first.
- Each entry shows "{from} → {to}", the actor's name, the time, and the note. Migrated entries show a muted "Migrated" tag and no actor.
- Entries are read-only and have no controls.

### 6.5. Requester Signal
The Lab 3 "Problem Appears Resolved" button and badge are unchanged. On the staff screens, Tickets with the flag show a pale-green "Requester says resolved" pill in the queue row, on the dashboard list, and in the detail header.

---

## 7. Drill-down Targets (FR-16)

- My Tickets, Ticket Queue, and User Management read their filters from the URL on load, write them back with `replaceState` when the filters change, and keep the filter controls in sync.
- New filter UI:
  - My Tickets: a "Status group: Active" option in the status filter.
  - Queue: a "Requester says resolved" checkbox and a "Status group: Active" option.
  - User Management: an "Account Status" filter (All Accounts / Active / Inactive), spec D-18.
  - Each list shows its total ("N tickets", "N users", or the Queue's "Showing x of N") so a drill-down can be compared with its card.
- Opening a drill-down link shows a dismissible "Filtered from Dashboard" chip with a [Clear filters] link.

---

## 8. Feedback States (FR-19, consistent across every screen)

| State | Component | Content |
|---|---|---|
| Loading | `LoadingState` (skeleton cards for dashboards, a spinner row for lists) | Includes `aria-busy="true"` and visually hidden text "Loading…" |
| Empty | `EmptyState` | An icon, one sentence, and an optional primary action |
| No results | `NoResultsState` | "No tickets match these filters" plus [Clear filters] |
| Validation | inline field errors with `role="alert"` and a red border | Placed under the field. A summary banner appears only when there are more than 3 errors. |
| Success | toast (auto-dismisses after 4 s, `role="status"`) | Short past-tense message |
| Forbidden (403) | `ErrorState` variant "forbidden" | "You don't have access to this page." plus a [Go to Dashboard] link |
| Not found (404) | `ErrorState` variant "notFound" | "This ticket doesn't exist or you can't view it." |
| Conflict (409) | amber inline banner | A specific message per code (§5.4, §6.2), with the draft kept |
| Safe failure (5xx or network) | `ErrorState` variant "failure" | "Something went wrong. Please try again." plus [Retry]. No raw error text. |

Duplicate-submit protection (FR-20): every primary mutating button is disabled with `aria-disabled` and shows a spinner from click until the response arrives. Enter-key submissions follow the same guard.

---

## 9. Responsive Rules (Lab 3 breakpoints)

| Screen | Desktop ≥ 992 | Tablet 768–991 | Mobile < 768 |
|---|---|---|---|
| Staff dashboard status cards | 6 in one row (wrapping to 3 + 3 at ≤ 1200) | 3 columns | 2 columns |
| Workload, priority, and user cards | 4 / 3 / 4 per row | 2 columns | 2 columns (1 column below 360) |
| Dashboard lists and Quick Actions | 2 columns (8 / 4) | stacked | stacked |
| Requester cards | 4 columns | 2 columns | 2 columns |
| Actions Taken | table | table, with Result and Follow-up merged into the Description cell | cards |
| Action drawer | 480 px right drawer | 60 % drawer | full-screen sheet |

The page body never scrolls horizontally at any width (`document.documentElement.scrollWidth <= innerWidth`). Card values and labels wrap and never clip.

---

## 10. Accessibility Additions (Lab 3 §7 remains)

- Metric cards: one link each. Their accessible name includes the value. The card grid is a `<ul>` with list semantics.
- Each dashboard section has an `<h2>` heading, and lists use `<ul>` or `<ol>`. The Actions Taken table has a `<caption>`, `scope="col"` headers, and a visually hidden "Actions" header for the button column.
- Showing the Follow-up Note field uses `aria-controls` and `aria-expanded` on the checkbox, and the new field receives focus.
- The `datetime-local` input has the label "Action date and time (Bangkok time)".
- Drawers and modals use `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`. They trap focus, close with Esc, and return focus to their trigger.
- Following the `#actions-taken` hash focuses the section heading (`tabindex="-1"`).
- Status, priority, action status, follow-up, and visibility are always shown as text and icon, never color alone.

---

## 11. Visual and Accessibility Checklist (completed in Issue 8, per screen per viewport)

Screens: Requester Dashboard, Staff Dashboard, Admin Dashboard, Staff Ticket Detail (Actions Taken: list, create, view, edit, cancel modal; Resolve modal; Status History), Requester Ticket Detail (read-only actions), plus the regression screens from Lab 3.

| Category | Item | Criteria | How verified | Result |
|---|---|---|---|:-:|
| Design consistency | Zen Green tokens | New cards, badges, and drawers use only Lab 3 tokens and the §1 additions | Screenshot review at 3 viewports | Pass |
| Dashboards | Card fidelity | Label, value, and "View all" visible; no clipping; zero shown as 0 | STYLE-L4-01, screenshots | Pass |
| Dashboards | Drill-down | Every card and list row navigates with the filter applied | E2E-L4-07 | Pass |
| Actions Taken | Editable vs read-only | Performed by and locked actions are ivory; open fields are white | STYLE-L4-02 | Pass |
| Actions Taken | Shared vs private | "Visible to Requester" tag on Actions; Internal Notes keep the amber confidential frame | STYLE-L4-02, screenshots | Pass |
| Validation placement | Inline | Errors under their field with `role="alert"`; server `INVALID_ASSIGNEE` under Assignee | UI-L4-03, E2E-L4-02 | Pass |
| Keyboard focus | Reachability | Cards, table buttons, drawer, and modals reachable and operable by keyboard; visible ring | A11Y-L4-01 | Pass |
| Clipping and overlap | Layout | No overlapping buttons or truncated badges at 375 px; drawer buttons fully visible | RESP-L4-01..03 | Pass |
| Horizontal overflow | Body | `scrollWidth <= innerWidth` on every Lab 4 screen and dialog | RESP-L4-01..03 | Pass |
| Feedback | States | Loading, empty, forbidden, failure, and conflict render as in §8 | UI-L4-08, E2E-L4-08 | Pass |
| Leftovers | Cleanup | No placeholder text, debug UI, dead links, or console errors | E2E console listener (E2E-L4-10) | Pass |

---

## 12. Screenshot Evidence Paths

Captured by `npm run test:e2e` into `artifacts/lab-04/screenshots/`:
```
artifacts/lab-04/screenshots/
├── staff-dashboard/     {desktop,tablet,mobile}-staff-dashboard.png, admin-dashboard-desktop.png,
│                        staff-dashboard-empty.png (olivia), staff-dashboard-error.png, drilldown-unassigned.png
├── requester-dashboard/ {desktop,tablet,mobile}-requester-dashboard.png, requester-dashboard-empty.png (nina),
│                        drilldown-waiting-for-me.png, forbidden-staff-dashboard.png
├── actions-taken/       {desktop,tablet,mobile}-actions-list.png, create-form-validation.png,
│                        inactive-assignee-rejected.png, edit-drawer.png, conflict-banner.png,
│                        cancel-action-modal.png, multiple-performers-one-ticket.png, requester-readonly-actions.png
└── workflow/            resolve-gate-blocked.png, resolve-success.png, status-history.png, permitted-transitions.png
```
