# CPE 334 — Introduction to Software Engineering in the Age of AI Agents

**Sections 1, 2, HS, 31 and 32. Semester: 1/2026.**

**Lab 3. TokTickIT Users, Roles, IT Staff Ticketing, and Admin Screens.**  Score: \_\_\_\_ / 60

**Instructors:**

| Name | Email |
| --- | --- |
| Assoc. Prof. Suthep Madarasmi, Ph.D. (Jogie/โจ๊ก) | suthep.mad@kmutt.ac.th |
| Aj. Piyanit Ua-areemitr, Ph.D (Toey) | piyanit.wep@kmutt.ac.th |
| Aj. Santawat Thanyadit Ph.D. (Job) | santawat.than@kmutt.ac.th |

**TAs:**

| Name | Email |
| --- | --- |
| Rachawipa Katippatee (Bom) | rachawipa.kati@gmail.com |
| Kantapat Suwannahong (Bump) | kantapat.suwan@kmutt.ac.th |
| Rattanachote Petpansri (Loogmoo) | rattanachote.petpa@kmutt.ac.th |
| Prapatsorn Sangrod (Noon) | prapatsorn.sangr@kmutt.ac.th |
| Supachok Deetaweesukh (Tik) | jedsadaporn.pann@mail.kmutt.ac.th |

---

## 1. Software Product Increment in Lab 3

Lab 3 replaces the temporary Development Requester selector with real authentication and role-based authorization. It also introduces the first operational IT Staff workflow and Administrator user management. By the end of this sprint, the application supports three roles: Requester, IT Staff, and Administrator.

- users authenticate with an email address and password;
- users with an initial password must change it at first login;
- each authenticated user sees only the navigation and actions permitted for their role;
- a Requester continues to create and manage their own Tickets using their authenticated identity;
- IT Staff can use a shared Ticket Queue, open Ticket Detail, claim or reassign ownership, set IT Priority, update permitted status values, post Public Comments, and write Internal Notes;
- a Requester can post Public Comments and indicate that the reported problem appears resolved;
- an Administrator can view users, create a user, update basic account information, assign one permitted role, activate or deactivate an account, and set a new initial password; and
- all Lab 2 Requester functions continue to work without the Development Requester selector.

## 2. Lab 3 Learning Outcomes

- design and implement secure authentication and first-login password change behavior;
- apply server-side role-based authorization and ownership checks rather than relying on hidden UI controls;
- evolve an existing data model and API without breaking the completed Lab 2 increment;
- design operational IT Staff list and Ticket Detail workflows using reusable Zen Green components;
- distinguish Public Comments from role-restricted Internal Notes;
- define and test ticket ownership, IT Priority, and permitted status-transition rules;
- apply Spec DD, Test DD, and TDD to authentication, authorization, workflow, and administration features;
- use GitHub Issues, feature branches, Pull Requests, peer review, and staged integration; and
- evaluate completion using traceable evidence from the final main branch.

## 3. Lab 3 Request from Stakeholder

> “The temporary Requester selector was useful for development, but the system now needs real users. Replace it with secure login. Administrators need a simple User Management screen where they can view users, create an account, assign one role, update basic account information, activate or deactivate an account, and set a new initial password. A user signing in with an initial password must choose a new password before entering the application.
>
> Requesters must continue using the ticket functions built in Lab 2, but the current Requester must now come from the authenticated account. IT Staff need a professional Ticket Queue where they can find work, open Ticket Detail, claim or reassign a Ticket, set IT Priority, communicate with the Requester through Public Comments, record private Internal Notes, and update the Ticket through its permitted workflow. Requesters may indicate that a problem appears resolved, but IT Staff remain responsible for formally resolving or closing the Ticket.
>
> Protect every API and screen according to role and ownership. Hiding a button is not authorization. Continue using the Zen Green design language and reusable components established in Lab 2.”

## 4. Engineering Contract for Sprint 3

Students must prepare and maintain the Sprint 3 engineering contract before implementation. It extends the Lab 2 contract and must clearly describe all data migrations, API changes, UI behavior, authorization rules, tests, and completion evidence. The AI coding agent may report completion only when the approved contract and Product Definition of Done are satisfied.

### 4.1. What the Engineering Contract Must Cover

- authentication, logout, current-user retrieval, and mandatory first-login password change;
- role-based navigation and server-side authorization for Requester, IT Staff, and Administrator;
- migration from Development Requester identity to the authenticated User model;
- continued Requester ownership protection for all Lab 2 Ticket and Attachment functions;
- IT Staff Ticket Queue, Ticket Detail, ownership, IT Priority, Public Comments, Internal Notes, and status workflow;
- minimalist Administrator user management, including user listing, account creation, basic editing, one-role assignment, activation or deactivation, and setting a new initial password;
- data model and REST API changes;
- Zen Green UI extensions and reusable component rules;
- acceptance criteria, planned tests, migration/regression evidence, and Product Definition of Done.

### 4.2. Explicitly Excluded from Lab 3

- email invitations, password-reset email, multi-factor authentication, social login, and single sign-on;
- self-registration and Requester-created accounts;
- Actions Taken by IT Staff;
- formal SLA calculation, escalation rules, and notification services;
- dashboards and KPI analytics beyond simple queue counts;
- multi-tenant organizations, departments, and customer administration; and
- production-grade deployment or cloud infrastructure changes.
- multiple roles assigned to one user;
- user deletion, bulk user operations, user import or export, and account-history screens;
- department, organization, profile-photo, and other extended user-profile management;
- email delivery of initial passwords or reset links;
- account unlocking, administrator approval workflows, and advanced identity-management functions; and
- advanced user-list features such as mandatory pagination, multi-column sorting, and multiple simultaneous filters.

### 4.3. Required Roles and Authorization

| Role | Minimum permitted behavior |
| --- | --- |
| **Requester** | Use authenticated identity; create Tickets; view and manage only owned Tickets and permitted Attachments; post Public Comments; indicate that a problem appears resolved. |
| **IT Staff** | View the IT Staff Ticket Queue; open Tickets; claim or reassign ownership; set IT Priority; perform permitted status changes; post Public Comments; create Internal Notes. |
| **Administrator** | Manage user accounts through the minimalist User Management screen. An Administrator may view users, create a user, edit basic account information, assign one permitted role, activate or deactivate an account, and set a new initial password. |

For Lab 3, Administrator and IT Staff responsibilities should remain conceptually separate. IT Staff manage Tickets. Administrators manage user accounts. An Administrator does not automatically need to perform IT Staff Ticket operations unless the approved authorization matrix explicitly permits it.

Students must work with the AI specification agent to complete the authorization matrix. Every protected operation must be enforced by the backend. A hidden or disabled frontend control is useful feedback, but it is not a security control.

### 4.4. Required Business Rules

The rules below are examples of mandatory rules, not a complete specification. Students must identify and number the remaining rules as BR-01, BR-02, and so on in `docs/lab-03/specification.md`.

| BR ID | Example Mandatory Business Rule |
| --- | --- |
| **BR-01** | Only an active user with valid credentials may authenticate. |
| **BR-02** | A user marked as requiring a password change cannot enter the normal application until a new valid password is saved. |
| **BR-03** | The authenticated user identity, not a requesterId supplied by the client, determines ownership of Requester operations. |
| **BR-04** | Public Comments are visible to the Requester, IT Staff, and Administrator. Internal Notes are visible only to IT Staff and Administrator. |
| **BR-05** | A Requester may indicate that the problem appears resolved, but cannot formally set the Ticket to Resolved or Closed. |

Students must complete rules for login attempts, password handling, logout, inactive users, duplicate email addresses, current-user behavior, Ticket ownership, IT Staff assignment, IT Priority, Public Comments, Internal Notes, status transitions, validation, failures, and regression behavior.

Administrator rules must remain limited to:

- creating a user with one permitted role;
- updating the user’s name, email address, role, and activation state;
- preventing duplicate email addresses;
- setting a new initial password that must be changed at the next login;
- preventing an Administrator from deactivating their own account;
- preventing removal or deactivation of the last active Administrator; and
- using deactivation instead of deleting users.

### 4.5. Ticket Ownership, Priority, and Status

- Each Ticket may have one primary Ticket Owner who is an active IT Staff or Administrator user. A Ticket may initially be unassigned.
- Requested Priority remains the value submitted by the Requester. IT Priority initially copies Requested Priority and may later be changed only by IT Staff or Administrator.
- The required Ticket statuses are New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, and Cancelled.
- Students must define a clear transition matrix, permitted roles, required confirmations, and validation behavior.
- Lab 3 does not include Actions Taken, so the later rule that blocks resolution while Actions Taken remain incomplete is deferred to Lab 4.

### 4.6. Public Comments and Internal Notes

- Public Comments are shared communication on a Ticket and are visible to the Requester, IT Staff, and Administrator.
- Internal Notes are operational notes visible only to IT Staff and Administrator.
- Both are append-only in Lab 3. Editing and deletion are excluded.
- Each entry records its author and creation time from the backend.
- Empty or whitespace-only content is rejected, and students must define justified length limits and safe rendering behavior.

## 5. Required Database Increment

Students must evolve the Lab 2 PostgreSQL and Prisma design without discarding existing Ticket or Attachment data. The design must support real users, credentials, roles, ticket ownership, IT Priority, Public Comments, Internal Notes, and the additional Ticket workflow fields required by the approved specification.

### 5.1. Required Concepts and Relationships

- one User has one permitted role in Lab 3: Requester, IT Staff, or Administrator;
- one Requester user may own many submitted Tickets;
- one Ticket may have zero or one primary Ticket Owner;
- one Ticket may contain many Public Comments;
- one Ticket may contain many Internal Notes;
- each Comment or Note has one author;
- existing Categories, Related Systems, Tickets, and Attachments remain valid after migration.

Students must determine fields, data types, foreign keys, indexes, enums or reference tables, timestamps, activation state, password-change state, and migration strategy. Passwords must never be stored in plaintext.

The User model does not need departments, multiple roles, profile images, role history, or account audit history in Lab 3.

### 5.2. Required Migration from Lab 2

The Lab 2 Development Requester records must be evolved or migrated into the real User model. Existing Ticket ownership must remain correct. Students must document and test how existing Requesters receive initial passwords, and how the temporary selector and its client-side state are removed.

### 5.3. Required Seed Data

- idempotent seed behavior that is safe to run repeatedly;
- at least four active Requester accounts and one inactive Requester account;
- at least three active IT Staff accounts and one inactive IT Staff account;
- at least one active Administrator account for testing User Management;
- realistic Tickets distributed across Requesters, statuses, priorities, and assigned or unassigned ownership; and
- example Public Comments and Internal Notes that do not expose sensitive information.

Seeded credentials are for local development only and must be clearly documented. Students must not place real personal passwords or secrets in the repository.

## 6. Required REST API Contract

The REST API must support the capabilities below. Students must define exact endpoint paths, methods, request and response shapes, cookies or token behavior, validation, safe errors, and status codes in `docs/lab-03/api-spec.md`.

- login, logout, current authenticated user, and mandatory password change;
- authenticated continuation of all Lab 2 Requester Ticket and Attachment APIs;
- IT Staff Ticket Queue retrieval with search, filters, sorting, and pagination;
- retrieve one Ticket for IT Staff operations;
- claim, assign, or reassign Ticket ownership;
- update IT Priority and permitted Ticket status;
- create and retrieve Public Comments;
- create and retrieve Internal Notes for permitted roles only;
- retrieve the user list as Administrator, with search by name or email and an optional role filter;
- create a user with one permitted role;
- update the user’s name, email address, role, and activation state; and
- set a new initial password that the user must change at the next login.
- issue or reset an initial password using the approved local-lab behavior.

The Administrator API does not need user deletion, bulk operations, import or export, role history, multiple-role assignment, email delivery, or advanced account-management workflows.

### 6.1. Authentication and Session Decisions

Students must work with the AI specification agent to choose and justify a secure approach suitable for this course stack. The contract must define password hashing, credential validation, authenticated-session or token storage, expiration, logout invalidation, CSRF considerations where applicable, and safe error messages. Authentication secrets must not be exposed to client code or committed to source control.

### 6.2. Authorization and Safe Errors

Every protected endpoint must distinguish unauthenticated access, authenticated but forbidden access, invalid input, missing resources, conflicts, and unexpected server errors. Students must avoid leaking whether another user’s protected Ticket, Attachment, or Internal Note exists.

### 6.3. Queue Query Behavior

The IT Staff Ticket Queue API must support search, suitable filters, sorting, and pagination. Students must decide and document searchable fields, filterable fields, sortable fields, default ordering, page sizes, pagination metadata, and behavior for invalid query parameters.

## 7. Zen Green Theme and Application Shell

Lab 3 must reuse the Zen Green design language established in Lab 2. Existing tokens, form conventions, cards, badges, buttons, validation placement, responsive rules, and accessibility expectations remain in force. New screens must look like part of the same application rather than a second visual system.

- replace the Development Requester display with the authenticated user’s name and role;
- provide Logout and permitted profile/password actions;
- show role-specific navigation without presenting unauthorized destinations;
- use consistent badges for Ticket status, Requested Priority, IT Priority, and role;
- preserve clear editable versus read-only field styling;
- provide visible loading, saving, success, validation, empty, no-results, forbidden, and safe failure feedback where meaningful; and
- keep all required screens usable on desktop, tablet, and mobile.

## 8. Required User Interfaces

### 8.1. Login and Mandatory Password Change

*(The handout shows example screen mockups here.)*

- Login screen with email, password, validation, busy state, and safe failure feedback;
- clear response for inactive accounts without exposing unnecessary account information;
- mandatory Change Password screen for users with an initial password;
- password rules, confirmation, validation, and successful continuation into the application;
- authenticated application shell showing the current user and role; and
- Logout action that removes authenticated access.

### 8.2. Requester Regression and Public Comments

The Lab 2 Requester screens must continue to work using the authenticated Requester identity. The Development Requester selector and Change Requester action must be removed. The Requester Ticket Detail screen must add Public Comments and the approved “Problem Appears Resolved” action while preserving Ticket and Attachment ownership protection.

### 8.3. IT Staff Ticket Queue

The Ticket Queue must help IT Staff locate and prioritize work. It must include search, suitable filters, sorting, pagination, clear ownership and status information, an action to open Ticket Detail, and meaningful loading, empty, no-results, forbidden, and failure feedback. Students must design the final desktop table and smaller-screen representation in `ui-spec.md`.

Example fields may include Ticket Number, Created Date, Summary, Category, Requested Priority, IT Priority, Current Status, Ticket Owner, and Last Updated. Students must justify the final set and avoid an unreadable mega-grid.

### 8.4. IT Staff Ticket Detail

*(The handout shows example screen mockups here.)*

The IT Staff Ticket Detail screen extends the Ticket screen created in Lab 2. Ticket information remains clearly grouped, with only permitted operational fields editable. The screen must provide Ticket ownership, IT Priority, permitted status changes, Public Comments, Internal Notes, existing Attachments, and clear role-specific actions. Public Comments and Internal Notes must be visually distinct so private information is not accidentally posted publicly.

### 8.5. Administrator User Management

*(The handout shows example screen mockups here.)*

The Administrator interface must remain intentionally simple. It should provide one User Management screen that supports the minimum functions needed for authentication and role-based access.

**Required functionality:**

- display a user list showing Name, Email, Role, Status, and an Edit action;
- search users by name or email;
- optionally filter users by role;
- create a user with name, email address, one permitted role, activation state, and an initial password;
- edit the user’s name, email address, role, and activation state;
- set a new initial password that must be changed at the user’s next login;
- prevent duplicate email addresses and invalid role values;
- prevent an Administrator from deactivating their own account;
- prevent the system from having no active Administrator; and
- provide clear validation, success, forbidden, and safe API-failure feedback.

**The following are not required:**

- user deletion;
- pagination for the user list;
- multi-column sorting;
- multiple simultaneous filters;
- multiple roles per user;
- departments or organizational structures;
- bulk operations;
- import or export;
- role history or account audit history;
- email invitations or password-reset email; and
- advanced account-recovery or identity-management workflows.

The Administrator screen should remain responsive and consistent with the Zen Green design language.

### 8.6. Required Screen Modes and User Feedback

Students must identify the main create, view, and edit modes for each screen. They do not need to invent a separate formal state for every error. They must provide clear feedback for meaningful processing, validation, success, empty/no-results, forbidden, not-found, conflict, and safe API-failure conditions, and cover these behaviors with appropriate tests.

### 8.7. Responsive and Accessibility Requirements

- Same as lab 2.

## 9. Spec DD Deliverable

**Required files**

```
docs/lab-03/specification.md
docs/lab-03/ui-spec.md
docs/lab-03/api-spec.md
```

Students must transform this handout into a concise and internally consistent Sprint 3 engineering specification. Do not copy the entire handout. Resolve implementation choices, identify assumptions, and describe how the Lab 2 increment is migrated and preserved.

| Section | What the Student Must Provide |
| --- | --- |
| **1. Sprint Goal** | One short paragraph stating the delivered value. |
| **2. Stakeholder Request** | A concise interpretation in the student’s own words. |
| **3. Scope** | Included and explicitly excluded work. |
| **4. Functional Requirements** | Numbered FR statements for authentication, authorization, IT Staff operations, comments and notes, and minimalist Administrator user management. |
| **5. Business Rules** | Numbered BR statements including roles, ownership, passwords, assignment, priority, status, comments, notes, account activation, one-role assignment, and Administrator safety rules. |
| **6. UI Specification Summary** | Screen structure, modes, controls, feedback, role behavior, responsive rules, and reference to ui-spec.md. |
| **7. Data Changes** | Models, fields, relationships, indexes, migration, and seed decisions. |
| **8. API Contract** | Endpoints, authentication mechanism, request/response shapes, statuses, authorization, and safe errors. |
| **9. Acceptance Criteria** | Observable and testable criteria such as AC-01. |
| **10. Definition of Done** | Product-completion checklist used by the coding agent. |
| **11. Assumptions and Decisions** | Only meaningful choices not fixed by the handout. |

### 9.1. Example Acceptance Criteria

| ID | Example Criterion |
| --- | --- |
| **AC-01** | Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role. |
| **AC-02** | Given a user who must change the initial password, when login succeeds, then normal application screens remain unavailable until a valid new password is saved. |
| **AC-03** | Given an authenticated Requester, when the client supplies another requesterId, then the backend still applies the authenticated identity and does not return another Requester’s data. |
| **AC-04** | Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected without exposing note content. |

Students must add enough criteria to cover the complete approved scope. Every Acceptance Criterion must map to at least one planned test.

## 10. Test DD and TDD Deliverable

**Required file**

```
docs/lab-03/tests.md
```

The test plan must be created before or alongside implementation. It must not be reconstructed afterward from whatever tests the coding agent generated. The plan must include unit, API or integration, UI component, UI style, responsive, security/authorization, migration/regression, and end-to-end coverage.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| **API-01** | API | AC-01 | Valid login | Authenticated response; safe user data | `server/tests/lab-03/auth.api.test.ts` | Pass |
| **API-08** | API | AC-04 | Requester requests Internal Notes | Forbidden; no note data returned | `server/tests/lab-03/notes.api.test.ts` | Pass |
| **E2E-02** | E2E | AC-02 | Initial password login and change | Normal app opens only after valid change | `e2e/lab-03/first-login.spec.ts` | Pass |

Students must identify the remaining tests for valid and invalid login, inactive accounts, password boundaries, logout, role navigation, direct API authorization, Requester regression, queue queries, ownership, IT Priority, status transitions, comments, notes, minimalist user administration, migration, responsive behavior, accessibility, and safe failures.

Administrator tests should cover user listing, search, optional role filtering, user creation, duplicate-email rejection, basic editing, one-role assignment, activation and deactivation, new initial-password behavior, prevention of self-deactivation, prevention of removing the last active Administrator, and forbidden access by non-Administrators.

## 11. GitHub Issues and Workflow

Use the same Kanban statuses introduced earlier. Before coding, decompose Sprint 3 into a reasonable set of GitHub Issues covering specification, tests, migration, authentication, authorization, Requester regression, IT Staff interfaces, user administration, E2E testing, visual inspection, and release integration.

| Example Issue | Possible Scope |
| --- | --- |
| **Sprint 3 engineering contract** | specification.md, tests.md, ui-spec.md, and api-spec.md. |
| **Authentication foundation** | User migration, password hashing, login/logout/current-user API, and tests. |
| **IT Staff Ticket Queue** | Queue API, responsive UI, search/filter/sort/pagination, and tests. |
| **IT Staff Ticket operations** | Ownership, IT Priority, status, Public Comments, Internal Notes, and tests. |
| **Administrator user management** | Minimalist Administrator user management. User list, name/email search, optional role filter, create/edit, one-role assignment, activation or deactivation, new initial password, safety rules, and tests. |

### 11.1. Required Branch Flow

- Use a branch flow similar to Lab 2, but here for Lab 3.

### 11.2. AI Specification and Coding Agent Rules

- Same as Lab 2

## 12. Required Repository Increment

**Minimum Lab 3 structure**

```
docs/lab-03/
├── specification.md
├── tests.md
├── ui-spec.md
├── api-spec.md
├── reviewer.md
└── ai-use.md

server/tests/lab-03/
├── auth.api.test.ts
├── authorization.api.test.ts
├── staff-queue.api.test.ts
├── staff-ticket-detail.api.test.ts
├── comments-notes.api.test.ts
└── users-admin.api.test.ts

client/.../lab-03 tests/
├── Login.test.tsx
├── ChangePassword.test.tsx
├── StaffTicketQueue.test.tsx
├── StaffTicketDetail.test.tsx
└── UserManagement.test.tsx

e2e/lab-03/
├── authentication.spec.ts
├── staff-ticket-flow.spec.ts
└── user-administration.spec.ts

artifacts/lab-03/screenshots/
├── authentication/
├── staff-queue/
├── staff-ticket-detail/
└── user-management/
```

## 13. Definition of Done for Lab 3

- Similar to Lab 2. Students are expected to work with an LLM to finalize the Definition of Done for Product Completion.

## 14. Submit One PDF File

Submit exactly one concise PDF. To make grading consistent for approximately 200 students, use the headings “Answer Part 1” through “Answer Part 9” in this exact order. Include working links. Screenshots must be readable without extreme zoom. The submitted repository and final main branch remain the source of truth.

| Part | Points | Required Submission Evidence |
| --- | --- | --- |
| **1. Git Use with Engineering Workflow** | 10 | Commit-history evidence showing feature branches merged into lab3-staging and then main; final GitHub Project/Kanban with all Issues in Done; rendered reviewer.md with reviewer identity, PR links, comments, responses, and approvals; README and .gitignore evidence; repository directory structure. |
| **2. Spec DD** | 5 | Link to and rendered `docs/lab-03/specification.md`. Show numbered requirements, business rules, authorization matrix or rules, acceptance criteria, migration decisions, and Product Definition of Done. Include evidence that the specification existed before the main implementation PRs were completed. |
| **3. Test DD and Traceability** | 10 | Link to and rendered `docs/lab-03/tests.md`. Include planned tests, AC traceability, actual test-file paths, and final status. Include complete unit, API/integration, UI, authorization, regression, and E2E passing test output from main. |
| **4. AI Use with Reflection** | 5 | Rendered `docs/lab-03/ai-use.md` naming the LLM used and showing 6-10 selected key prompts. Provide a brief “My Reflection” on specification-agent and coding-agent use. |
| **5. Working Login and Password Change UI** | 5 | Demonstrate valid and invalid login, inactive-account handling, busy and safe failure feedback, mandatory first-password change, authenticated user/role display, logout, and direct access blocked after logout. |
| **6. Working IT Staff Ticket Queue UI** | 5 | Demonstrate realistic queue data, search, filters, sorting, pagination, assigned/unassigned ownership, status and priority badges, open-detail action, empty/no-results/failure feedback, and responsive behavior. |
| **7. Working IT Staff Ticket Detail UI** | 10 | Demonstrate claim/reassign, IT Priority, permitted status changes, Public Comments, Internal Notes, Attachment continuity, Requester resolution indication, role restrictions, validation, and safe failure behavior. Include direct API authorization evidence. |
| **8. Working Administrator User Management UI** | 5 | Demonstrate the minimalist User Management screen with:<br>● user list showing Name, Email, Role, Status, and Edit action;<br>● search by name or email;<br>● optional role filtering;<br>● create user with one permitted role and initial password;<br>● duplicate-email and invalid-input validation;<br>● edit name, email, role, and activation state;<br>● set a new initial password and demonstrate required password change at next login;<br>● prevention of self-deactivation and prevention of removing the last active Administrator;<br>● forbidden access for non-Administrators; and<br>● responsive Zen Green presentation and safe failure feedback. |
| **9. Zen Green UI and Responsive Evidence** | 5 | Rendered `ui-spec.md` plus desktop, tablet, and mobile screenshots for all major Lab 3 screens. Include the completed visual checklist for design consistency, role navigation, badges, editable/read-only fields, validation placement, focus, clipping, overlap, and horizontal overflow. |

To make grading faster and more consistent, you must format your PDF using the following format:

```
Answer Part 1:
[Place your content here]

Answer Part 2:
[Place your content here]
…

Answer Part 9:
[Place your content here]
```
