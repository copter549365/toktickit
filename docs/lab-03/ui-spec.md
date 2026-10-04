# Lab 3 Zen Green UI Specification

This specification defines the visual hierarchy, component states, layout behaviors, accessibility rules, and responsive requirements for the TokTickIT Lab 3 increment. All screens must extend the established Zen Green design system.

---

## 1. Zen Green Color Tokens

| Token | CSS Variable | Hex Value | Primary Usage |
|---|---|---|---|
| Primary Green | `--color-primary` | `#006B3C` | Navbar background, primary action buttons, strong brand emphasis |
| Secondary Green | `--color-secondary` | `#0B7A46` | Active navigation tabs, focus rings, interactive link hover, checkmarks |
| Pale Green | `--color-pale` | `#EAF6EF` | Selected row backgrounds, success alerts, subtle panel shading |
| Page Background | `--color-bg` | `#F5F7F6` | Soft neutral backdrop for all viewports |
| Surface / Card | `--color-surface` | `#FFFFFF` | Form cards, table containers, modals, popovers |
| Body Text | `--color-text` | `#1F2A24` | Primary high-contrast charcoal-green text; never pure black |
| Muted Text | `--color-text-muted` | `#5C6B64` | Subtitles, helper text, timestamps, table column headers |
| Border Neutral | `--color-border` | `#CBD5D1` | Input outlines, table cell borders, card dividing lines |
| Editable Field BG | `--color-field-editable-bg`| `#FFFFFF` | Interactive input field background |
| Read-only Field BG | `--color-field-readonly-bg`| `#F1F0E8` | Warm ivory read-only field fill, clearly distinguished from editable fields |
| Error / Danger | `--color-error` | `#8A1F1F` | Form validation errors, destructive buttons, critical alerts |
| Warning / Amber | `--color-warning` | `#B36B00` | Warning callouts, **Internal Notes distinct framing & warning badges** |
| Warning Pale BG | `--color-warning-pale` | `#FFFBEB` | Internal Notes panel background |
| Success | `--color-success` | `#0B7A46` | Success confirmations, toast notices |

---

## 2. Typography, Layout & Spacing

- **Font Family:** System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`).
- **Base Spacing:** 8px grid system. Form elements use 16px vertical gap; card sections use 24px margins.
- **Elevation / Shadows:**
  - Card shadow: `0 1px 3px rgba(0, 107, 60, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)`.
  - Modal / Drawer shadow: `0 10px 25px rgba(0, 0, 0, 0.15)`.

---

## 3. Badges Specification

### 3.1. Role Badges
| Role | Background | Text Color | Border |
|---|---|---|---|
| `Requester` | `#EAF6EF` (Pale Green) | `#006B3C` (Primary Green) | 1px solid `#B8DFC9` |
| `IT Staff` | `#E0F2FE` (Soft Blue) | `#0369A1` (Ocean Blue) | 1px solid `#BAE6FD` |
| `Administrator` | `#F3E8FF` (Soft Purple) | `#6B21A8` (Deep Purple) | 1px solid `#E9D5FF` |

### 3.2. Priority Badges (Requested Priority & IT Priority)
| Priority | Background | Text Color | Border |
|---|---|---|---|
| `LOW` | `#F0FDF4` (Soft Mint) | `#166534` (Forest Green) | 1px solid `#DCFCE7` |
| `MEDIUM` | `#FEF3C7` (Soft Amber) | `#92400E` (Deep Amber) | 1px solid `#FDE68A` |
| `HIGH` | `#FEE2E2` (Soft Coral) | `#991B1B` (Deep Red) | 1px solid `#FECACA` |

### 3.3. Ticket Status Badges
| Status | Background | Text Color | Visual Indicator |
|---|---|---|---|
| `NEW` | `#E0F2FE` | `#0284C7` | Blue pill badge |
| `OPEN` | `#FEF9C3` | `#A16207` | Yellow pill badge |
| `IN_PROGRESS` | `#DBEAFE` | `#1D4ED8` | Indigo/blue pill badge |
| `WAITING_FOR_REQUESTER` | `#FFEDD5` | `#C2410C` | Orange pill badge |
| `RESOLVED` | `#DCFCE7` | `#15803D` | Green pill badge |
| `CLOSED` | `#F3F4F6` | `#4B5563` | Gray neutral badge |
| `REOPENED` | `#FCE7F3` | `#BE185D` | Magenta pill badge |
| `CANCELLED` | `#FEE2E2` | `#991B1B` | Red pill badge |

---

## 4. Component Patterns & Field States

### 4.1. Input Fields
- **Editable:** White background (`--color-field-editable-bg`), 1px `#CBD5D1` border, 6px border radius. On focus: 2px `--color-secondary` outline with zero offset.
- **Read-only:** Shaded with `--color-field-readonly-bg` (`#F1F0E8`), `aria-readonly="true"`, cursor default, clear non-editable appearance.
- **Invalid Field:** 1.5px `--color-error` border. Error text rendered immediately below the input with `role="alert"`.

### 4.2. Buttons
- **Primary Button:** Solid `--color-primary` (`#006B3C`), white text, hover `#00522E`. Shows inline spinner when busy.
- **Secondary Button:** White surface, border 1px `--color-border`, text `--color-text`, hover `--color-pale`.
- **Destructive Button:** White surface with 1px `--color-error` border and text, or solid `--color-error` for confirmation modals.

---

## 5. Screen Specifications

### 5.1. Login Screen
- **Structure:** Centered card (max width 420px) on quiet `--color-bg`.
- **Elements:**
  - TokTickIT brand logo and subtitle.
  - "Sign in to your account" heading.
  - Email field with validation.
  - Password field with show/hide password toggle.
  - "Sign In" button (displays busy spinner when authenticating).
  - Safe error alerts ("Invalid email or password" or "Account has been deactivated").

### 5.2. Mandatory First-Login Password Change Screen
- **Structure:** Centered card (max width 480px).
- **Elements:**
  - Header: "Change Your Password" with subtitle "You must change your temporary password to continue".
  - Current (temporary) password input.
  - New password input + Confirm password input.
  - Live Checklist of password complexity rules:
    - [ ] At least 8 characters
    - [ ] Includes uppercase & lowercase letters
    - [ ] Includes a number and a special character
  - "Update Password and Enter" action button.

### 5.3. Application Shell & Role-Based Navigation
- **Navbar:** `--color-primary` background, brand logo on the left.
- **Role Navigation:**
  - **Requester:** `My Tickets` | `Create Ticket`
  - **IT Staff:** `Ticket Queue` | `Create Ticket`
  - **Administrator:** `User Management`
- **User Profile Pill (Right Side):**
  - Displays user Full Name and distinct Role Badge.
  - "Sign Out" action button.

### 5.4. Requester Ticket Detail (Regression & Public Comments)
- All Lab 2 ticket overview cards, read-only metadata, and attachment management remain fully functional.
- **New Features:**
  - **"Problem Appears Resolved" Action:** Visible for active tickets in `IN_PROGRESS` or `WAITING_FOR_REQUESTER` allowing Requester to indicate problem is fixed without modifying formal status.
  - **"Cancel Ticket" Action:** Visible only when ticket is in `NEW` status, opening a confirmation dialog before cancelling.
  - **Public Comments Thread:** Clean timeline beneath ticket details with avatar badge, author name, timestamp, and message bubble. Includes an "Add Comment" textarea with character counter (max 2,000 chars) and "Post Comment" button.
  - **Internal Notes:** Strictly hidden from Requester view.

### 5.5. IT Staff Ticket Queue Screen
- **Header:** "IT Staff Ticket Queue" with quick summary count ("Showing X of Y tickets").
- **Filter Toolbar:**
  - Search input (searches Ticket No. and Summary).
  - Category dropdown filter.
  - Status dropdown filter.
  - Priority dropdown filter (Requested & IT Priority).
  - Owner dropdown filter (`All`, `Unassigned`, `Assigned to Me`).
  - "Clear Filters" button.
- **Data Table:**
  - Columns: `Ticket No.`, `Created Date`, `Summary`, `Category`, `Req. Priority`, `IT Priority`, `Status`, `Owner`, `Actions`.
  - Sortable column headers with visual sort indicators (↑ / ↓).
  - Row click or "Open" button navigates to IT Staff Ticket Detail.
- **Pagination Footer:** Previous / Page numbers / Next buttons, page size selector.
- **Empty / No-Results States:**
  - When queue is empty: Friendly icon + "No tickets in queue".
  - When filter has no matches: "No tickets match your filters" + "Reset Filters" action.

### 5.6. IT Staff Ticket Detail Screen
- **Header:** Breadcrumb navigation ("Queue > Ticket Detail"), Ticket Number, Status Badge, "Back to Queue" button.
- **Operational Editing Panel:**
  - **Ticket Owner Control:** Dropdown of active IT Staff and Admins, plus "Claim Ticket" quick action button.
  - **IT Priority Control:** Editable dropdown (`LOW`, `MEDIUM`, `HIGH`).
  - **Status Workflow Control:** Dropdown displaying only permitted next statuses based on current status (BR-13), plus Save Status button with confirmation modal when transitioning to `RESOLVED`, `CLOSED`, `REOPENED`, or `CANCELLED`.
- **Requester Resolution Banner:** Visible if `requesterResolvedIndicator === true` ("Requester has indicated this issue appears resolved. Review and proceed with formal resolution if verified.").
- **Communication Tabs / Sections (CRITICAL DISTINCTION):**
  - **Public Comments Tab:** Standard Zen Green styling. Comments are visible to the Requester. Helper notice: "Comments posted here are visible to the Requester."
  - **Internal Notes Tab:** **Distinct Amber/Gold Border (`#B36B00`) and Light Amber Background (`#FFFBEB`).**
    - Prominent Warning Banner: `🔒 Internal Notes — Visible ONLY to IT Staff and Administrators. Never shared with Requesters.`
    - Note input with "Save Internal Note" button.
- **Attachments Card:** Displays uploaded attachments with preview and download actions.

### 5.7. Administrator User Management Screen
- **Header:** "User Management" + "Create New User" primary button.
- **Filter Bar:** Search by name or email, Role filter dropdown (`All Roles`, `Requester`, `IT Staff`, `Administrator`).
- **User List Table:**
  - Columns: `Full Name`, `Email Address`, `Role` (Badge), `Status` (Active green / Inactive gray badge), `Actions` ("Edit User").
- **Create User Drawer / Modal:**
  - Full Name input (required).
  - Email Address input (required, validated format).
  - Role selector (`Requester`, `IT Staff`, `Administrator`).
  - Initial Password input (auto-generates compliant temporary password with option to customize).
  - Helper text: "User will be required to change their password on first login."
  - "Save User" and "Cancel" buttons.
- **Edit User Drawer / Modal:**
  - Editable Name, Email, and Role.
  - **Status Toggle:** Active / Inactive switch.
    - Safety guardrail: Self-deactivation disabled with tooltip "You cannot deactivate your own account."
    - Safety guardrail: Last active administrator cannot be deactivated or demoted.
  - **"Reset Initial Password" Section:** Generates a new temporary password and flags account for mandatory password change at next login.

---

## 6. Responsive Layout Breakpoints

- **Desktop (≥ 992px):** Full multi-column data tables, side-by-side operational panels, top navbar tabs.
- **Tablet (768px – 991px):** Two-column layout where practical; compact tables with horizontal scroll if needed, stacked operational cards.
- **Mobile (< 768px):**
  - Queue converts from table to stacked card items showing Ticket No, Status, Summary, Priority, and Owner.
  - User Management list converts to stacked cards showing Name, Email, Role, Status, and Edit User (Issue 8).
  - Form inputs stack vertically (100% width).
  - Sticky action buttons at bottom of ticket detail.
  - Navigation converts to mobile drawer or bottom bar.
  - No horizontal scrolling on the page body.

---

## 7. Accessibility (Handout §8.7 — Same as Lab 2)

- **Keyboard Navigation:** All interactive controls (buttons, links, inputs, selects, tabs, modals) are fully reachable via keyboard in a logical tab order. Focus is trapped within open modals and drawers.
- **Focus Rings:** Visible focus ring (`2px solid --color-secondary` with zero offset) present on every interactive element at all viewports. Never suppressed via `outline: none` without replacement.
- **Screen Reader Announcements:** Dynamic error messages and alerts utilize `role="alert"` so assistive technologies announce them immediately upon submission failures.
- **Accessible Names:** Every icon-only button (such as password visibility toggle, close buttons, modal dismiss) possesses an explicit `aria-label` and visual tooltip.
- **Form Association:** Every input, select, and textarea is explicitly linked to its visual label via programmatic attributes (`htmlFor` / `id`).
- **Color Independence:** Color is never used as the sole conveyor of status, priority, or role. Badges pair curated background colors with high-contrast text labels and distinct semantic indicators.
- **Contrast Ratios:** All body text meets or exceeds WCAG AA contrast ratio of 4.5:1 against its background.

---

## 8. Visual Inspection Checklist (per Screen, per Viewport)

Verified during Issue 8 across Desktop (1280px), Tablet (768px), and Mobile (375px). Each row lists the automated assertion in `e2e/lab-03/responsive.spec.ts` (or the named spec) plus a manual review of the screenshots in §9.

| Checklist Category | Verification Item | Inspection Criteria | How verified | Result |
|---|---|---|---|:---:|
| **Design Consistency** | Zen Green Tokens | All surfaces, buttons, text, and borders adhere to the Zen Green token palette (§1) | Screenshot review of every screen at 3 viewports | ✅ after fix: leftover Vite `#root { text-align: center }` was centering all content |
| **Role Navigation** | Strict Nav Segregation | Authenticated user sees only their permitted navigation links (Requester, Staff, Admin) | E2E-01 checks every role's header links; RESP checks the collapsed mobile nav; wrong-role URLs show a forbidden state (UI-16) | ✅ |
| **Badges Fidelity** | Badges Specification | Status, Priority, and Role badges match exact color tokens, text contrast, and border styles (§3) | Screenshot review; STYLE-02 checks that no badge label is clipped | ✅ |
| **Field Semantics** | Editable vs Read-only | Read-only fields shaded warm ivory (`#F1F0E8`); editable fields render crisp white with focus outline | STYLE-01 checks computed `rgb(241, 240, 232)` vs `rgb(255, 255, 255)` | ✅ |
| **Comments vs Notes**| Visual Disambiguation | Internal Notes render with distinct warning amber border (`#B36B00`) and lock banner; never confused with Public Comments | STYLE-01 checks a 1px `rgb(179, 107, 0)` border and a distinct fill; E2E-04 checks each message appears only in its own panel | ✅ after fix: `border-0` was removing the amber border |
| **Validation Placement**| Inline Error Rendering | Error text rendered directly beneath invalid field with `role="alert"` and red border; not just top banner | E2E-02 (change password), E2E-05 (create/edit user) | ✅ |
| **Focus Indication** | Keyboard Accessibility | Focus outlines clearly visible on all inputs, tabs, and buttons without clipping | STYLE-02 tabs to key inputs and checks for an outline or box-shadow ring | ✅ |
| **Layout Integrity** | Clipping & Overlap | No clipped labels, button text, badges, or overlapping UI components across viewports | STYLE-02 (no `.zg-badge`/`.btn` overflow) plus screenshot review | ✅ after fix: mobile user list hid Role/Status/Edit off-screen (now cards) |
| **Responsive Purity** | No Horizontal Overflow | Zero unintended horizontal scrolling on the page body (`document.body.scrollWidth === window.innerWidth`) | RESP-01..03 on every screen and dialog | ✅ |
| **Feedback States** | Complete State Handling | Loading spinner, empty state graphic, no-results filter state, and safe failure messages rendered correctly | E2E-06 (login busy/failure), E2E-08 (queue empty/no-results/failure/forbidden), E2E-05 (forbidden, last-admin refusal) | ✅ |

---

## 9. Screenshot Evidence Paths

Captured by `npm run test:e2e` into `artifacts/lab-03/screenshots/`. `{desktop,tablet,mobile}-*` files come from the responsive suite; the rest capture specific states from the journey specs.

```
artifacts/lab-03/screenshots/
├── authentication/
│   ├── {desktop,tablet,mobile}-login.png
│   ├── {desktop,tablet,mobile}-change-password.png
│   ├── {desktop,tablet,mobile}-requester-home.png
│   ├── app-shell-requester-desktop.png
│   ├── login-busy.png
│   ├── login-error-safe.png
│   ├── login-inactive-account.png
│   ├── first-login-password-change-desktop.png
│   └── first-login-password-change-validation.png
├── staff-queue/
│   ├── {desktop,tablet,mobile}-queue.png          (mobile = stacked cards)
│   ├── queue-filtered-status-priority.png
│   ├── queue-no-results-state.png
│   ├── queue-empty-state.png
│   ├── queue-api-failure.png
│   └── queue-forbidden-requester.png
├── staff-ticket-detail/
│   ├── {desktop,tablet,mobile}-ticket-detail.png
│   ├── ticket-detail-claim-and-reassign.png
│   ├── ticket-detail-status-transition-modal.png
│   ├── ticket-detail-public-comments.png
│   ├── ticket-detail-internal-notes-amber-warning.png
│   └── ticket-detail-requester-resolved-badge.png
└── user-management/
    ├── {desktop,tablet,mobile}-user-list.png      (mobile = stacked cards)
    ├── {desktop,tablet,mobile}-create-user.png
    ├── {desktop,tablet,mobile}-edit-user.png
    ├── admin-user-list-desktop.png
    ├── admin-user-list-filtered-role.png
    ├── admin-create-user-drawer.png
    ├── admin-edit-user-drawer.png
    ├── admin-reset-initial-password-modal.png
    ├── admin-self-deactivation-blocked.png
    ├── admin-last-admin-protection.png
    └── admin-forbidden-it-staff.png
```
