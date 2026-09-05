# Lab 2 Zen Green UI Specification

Reference illustrations: the handout's Ticket Detail (Figure 1), Development Requester Selection, and My
Tickets mockups. This document is the source of truth the coding agent implements against — the images set
direction, they do not override anything written here.

## 1. Color Tokens

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#006B3C` | App header background, primary buttons, strong emphasis. |
| `--color-secondary` | `#0B7A46` | Active tab indicator, focus accents, links, hover states. |
| `--color-pale` | `#EAF6EF` | Selected rows, success surfaces, subtle section emphasis. |
| `--color-bg` | `#F5F7F6` | Page background. |
| `--color-surface` | `#FFFFFF` | Cards/panels, subtle border + restrained shadow. |
| `--color-text` | `#1F2A24` (dark charcoal-green) | Body text; never pure black. |
| `--color-field-editable-bg` | `#FFFFFF` | Editable input background, neutral border `#CBD5D1`. |
| `--color-field-readonly-bg` | `#F1F0E8` (warm ivory) | Read-only field background, distinct but legible. |
| `--color-error` | `#8A1F1F` | Error text/border. |
| `--color-warning` | `#B36B00` (amber) | Warning callouts/badges only — never decorative. |
| `--color-success` | `#0B7A46` | Success confirmations, paired with icon/text, never color alone. |

## 2. Typography and Spacing

- Base font size 16px, headings scale via Bootstrap's default type ramp (already in the stack).
- Field label: 14px, weight 600, `#1F2A24`, 4px margin above its control.
- Base spacing unit 8px; form field vertical rhythm is 16px between fields, 24px between field groups.
- Section headings inside cards: 18px, weight 700, `--color-primary`.

## 3. Component States

### Fields

- **Editable**: white background, 1px `#CBD5D1` border, 4px radius. Focus: 2px `--color-secondary` outline,
  never removed (keyboard accessibility).
- **Read-only**: `--color-field-readonly-bg` background, no focus ring, `aria-readonly="true"`, used for
  Ticket Number, Ticket Date, Current Status, Ticket Owner, IT Priority.
- **Invalid**: `--color-error` border, error icon, message rendered directly beneath the field
  (`role="alert"`), never only summarized at the top of the form.
- **Disabled**: 50% opacity, `cursor: not-allowed`, no hover/focus effects, cannot receive keyboard focus.
- **Required marker**: red asterisk directly after the label text; the asterisk is decorative
  (`aria-hidden="true"`) and never substitutes for the validation message.

### Buttons

| Variant | Style | Example |
|---|---|---|
| Primary | Solid `--color-primary`, white text | Submit, Continue, Create Ticket |
| Secondary | Outline `--color-secondary`, transparent fill | Cancel, Change Requester |
| Tertiary | Text-only, `--color-secondary` | Clear Filters |
| Destructive | Solid `--color-error`, white text | Remove Attachment (confirm step) |
| Disabled | 50% opacity, no pointer events | any of the above while invalid/loading |
| Busy | Spinner + label unchanged (e.g. "Submitting…"), disabled while in flight | Submit during POST /api/tickets |

Every button shows visible text; icons (e.g. trash for remove, download arrow) may accompany but never
replace the label. Icon-only controls (e.g. a compact mobile "..." menu) require `aria-label` and a tooltip.

### Badges

| Field | Values → color |
|---|---|
| Requested Priority | LOW → pale/gray-green; MEDIUM → amber; HIGH → error-red text on pale background |
| IT Priority | Always "Not yet triaged" pill (gray) in Lab 2 — no colored priority badge, since IT Staff triage is out of scope (BR-10) |
| Current Status | NEW → `--color-pale` background, `--color-secondary` text (the only status producible in Lab 2) |

Badges pair color with a text label; color is never the only signal (accessibility).

### Loading / Empty / No-results / Error

- **Loading**: skeleton rows (list) or spinner + "Loading…" text (detail/selection screens); never a blank
  screen.
- **Empty** (list has zero rows, no filters applied): centered icon, "You haven't created any tickets yet."
  message, primary "Create Ticket" action.
- **No-results** (filters/search applied, zero matches): centered message "No tickets match your filters.",
  secondary "Clear Filters" action. Visually distinct copy/icon from the Empty state (AC-14 vs AC-15).
- **Error** (API failure): inline banner, plain-language message, "Retry" action; form screens additionally
  preserve entered values (BR-17, AC-09).

## 4. Screens

### 4.1 Application Shell

- Header: TokTickIT wordmark (left), "My Tickets" / "Create Ticket" nav (center-left), current Requester name
  + "Profile ▾" menu containing "Change Requester" (right).
- Active nav item: `--color-secondary` underline/background per the handout's active-tab token.
- Mobile (<768px): nav collapses behind a hamburger/menu control; Requester name still visible or reachable
  within one tap.

### 4.2 Development Requester Selection

Layout per the handout mockup: centered card, icon, "Select Development Requester" heading, one-sentence
explanation that this is a Lab 2 test mechanism (not login), the Requester dropdown, an informational note
("Only active development requesters are shown"), a callout that authentication arrives in Lab 3, and
Cancel/Continue actions.

- Dropdown is a native `<select>` (or accessible listbox) populated from `GET /api/requesters`; label
  "Development Requester *".
- States: loading (disabled dropdown + spinner), loaded, empty (no active Requesters — inline message,
  Continue disabled), failure (inline error banner, Retry).
- Continue is disabled until a Requester is chosen; on success it stores the selection and routes into the
  app shell, defaulting to My Tickets.
- Fully keyboard operable: Tab reaches the dropdown and Continue in order; Enter on the dropdown does not
  submit prematurely.

### 4.3 Create Ticket

Top-to-bottom grouping (desktop):

1. System-generated row (read-only, shown once a ticket exists — on the create form itself, Ticket Number/
   Date are shown as "Assigned after submission" placeholders, not blank editable boxes).
2. Classification group: Category, Related System, Requested Priority — three columns on desktop, stacked on
   mobile.
3. Summary (single-line, full width) and Description (multi-line, full width, resizable vertically only).
4. Attachments panel: drag/select control, list of pending files with name/size/remove-before-submit,
   inline per-file error (type/size) shown next to that file, running "n / 5 attachments" counter.
5. Actions row: primary "Submit Ticket" (busy state while POST is in flight) + secondary "Cancel".
6. Success state (replaces the form or shows a confirmation panel above it): generated Ticket Number,
   "View Ticket" and "Create Another" actions.

### 4.4 My Tickets

- Header: "My Tickets" title, subtitle, "Create Ticket" primary action, "Clear Filters" tertiary action.
- Controls row: search input (ticket number/summary), Category filter, Requested Priority filter, Current
  Status filter — all left-aligned on desktop, stacked full-width on mobile.
- **Desktop (≥992px)**: table with sortable column headers (click/keyboard-toggle sort indicator) — Ticket
  No., Created Date, Summary, Category, Requested Priority, Current Status, Last Updated — row click opens
  Ticket Detail.
- **Mobile (<768px)**: one card per ticket — Ticket No. + Summary as the card title, badges for
  Category/Priority/Status, Created/Updated dates as secondary text, whole card tappable.
- **Tablet (768–991px)**: condensed table (fewer columns) or card layout, whichever keeps every value
  unclipped; Summary keeps enough width to avoid mid-word wraps.
- Pagination: Previous/Next + page numbers, current page visually distinct, disabled state at first/last page.
- Empty and no-results states per §3.

### 4.5 Requester Ticket Detail (View Mode)

- Breadcrumb: "My Tickets > Ticket Details" with a "Back to My Tickets" action.
- Read-only field groups (all `--color-field-readonly-bg`): Ticket No., Ticket Date, Category, Related
  System / Requester, Requested Priority, IT Priority ("Not yet triaged"), Current Status ("New" badge) /
  Ticket Owner ("Unassigned") / Summary (full width) / Description (full width).
- Attachments panel, separated visually from ticket fields (per the handout's tabbed Figure 1 layout,
  simplified to Attachments only — no Comments/Actions/Event Log tabs in Lab 2):
  - Active attachments: filename, type icon, size, uploaded date, Download button, Remove button (opens a
    confirm dialog requiring a removal reason, 3–200 chars, before calling DELETE).
  - Removed attachments: same row styled muted/struck-through filename, "Removed" badge, removal reason and
    date shown, Download replaced by a disabled control with a tooltip explaining why.
  - "Add Attachment" control reuses the Create Ticket attachment picker/validation, disabled once 5 active
    attachments exist (counter shown).

## 5. Screen Modes and Feedback

Three modes are in scope: **Selection** (Requester Selection), **Create** (Create Ticket), **View**
(My Tickets, Ticket Detail — read-only, no Edit mode in Lab 2). Validation, success, failure, and empty-result
feedback for each is enumerated in §3–§4 and traced to Acceptance Criteria in `specification.md` §9 and to
tests in `tests.md`.

## 6. Responsive Rules

| Viewport | Behavior |
|---|---|
| Desktop ≥992px | Multi-column layout as described per screen; content max-width ~1140px, centered. |
| Tablet 768–991px | Two-column layout where practical; Summary/Description keep full available width. |
| Mobile <768px | Fields stack vertically; buttons full-width or touch-sized (min 44px height); no horizontal page scroll. |
| All sizes | No clipped labels, overlapping messages, hidden buttons, or truncated-unreadable attachment filenames (use CSS ellipsis + `title` attribute instead of hard cut-off). |

## 7. Accessibility

- All interactive controls reachable by keyboard in a logical tab order; visible focus ring at every size.
- Every icon-only control has `aria-label` + tooltip.
- Validation messages use `role="alert"` so screen readers announce them on submit.
- Color is never the sole indicator for priority/status/validation — always paired with text or an icon.
- Form labels are programmatically associated with their control (`<label for>`/`aria-labelledby`).

## 8. Visual Inspection Checklist (per screen, per viewport)

Verified in Issue 7 against the 42 screenshots listed in §9, captured by the Playwright suite in
`e2e/lab-02/` at desktop/tablet/mobile for every state below.

- [x] No clipped labels or truncated buttons.
- [x] No overlapping validation messages or badges.
- [x] No unintended horizontal scrolling on the page body (asserted programmatically in every
      `e2e/lab-02/responsive-*.spec.ts` test, not just eyeballed).
- [x] Editable vs. read-only fields are visually distinguishable at a glance.
- [x] Required-field asterisks present on every required control (also covered by STYLE-01).
- [x] Badge colors match §3 for every Priority/Status value present on screen (also covered by UI-15).
- [x] Loading/empty/no-results/error states match the specified copy and layout, not a raw blank screen.
- [x] Attachment filenames are fully readable (ellipsis + tooltip, not hard truncation). This item
      failed on first inspection — the metadata row's outer flex container had `text-truncate`
      fighting its own non-shrinking children (icon/size badge/upload date) for space, crushing
      filenames like `test-photo.png` down to a single character at mobile width. Fixed in
      `AttachmentSection.tsx` by giving the upload date its own line and the filename the
      remaining width; re-verified by re-running the responsive Ticket Detail spec.

## 9. Screenshot Evidence Paths

Captured in Issue 7 (`e2e/lab-02/requester-ticket-flow.spec.ts` + manual capture), stored under:

```
artifacts/lab-02/screenshots/
├── create-ticket/   (desktop, tablet, mobile — initial, validation-error, submitting, success, api-failure)
├── my-tickets/       (desktop, tablet, mobile — populated, empty, no-results, cross-requester isolation)
└── ticket-detail/    (desktop, tablet, mobile — active attachments, removed attachment, add-attachment)
```

`tests.md` §4 cross-references these paths against the checklist in §8 above.
