# Lab 3 — Peer Review Record

**Author:** @copter549365

**Reviewers**

| Role | Name | Student ID | GitHub |
|---|---|---|---|
| First Peer Reviewer | Napat Utabuawong | 67070501041 | [@AlphabetCG](https://github.com/AlphabetCG) |
| Second Peer Reviewer | Alongkron Kaeprom | 67070501050 | [@Alongkron1234](https://github.com/Alongkron1234) |
| Additional Reviewer | Paphangkorn Luanseng | 67070501083 | [@IEAR2548](https://github.com/IEAR2548) |

**Branch flow:** Issue branch → `lab3-staging` → `main` (release PR).

Issues 2–8 took one extra step. Review of #43 asked for the Lab 2 restore to be split from the Issue 2 work, so #44 (restore → `lab3-staging`) and #45 (Issue 2) were opened separately, with #45 stacked on the restore branch so its diff showed only Issue 2. After #44 merged, the base of later PRs was never switched back to `lab3-staging`, so #45–#51 merged into `restore/lab2-into-lab3-staging`. [#52](https://github.com/copter549365/toktickit/pull/52) then brought that branch into `lab3-staging` as one integration PR. Every Issue PR was still reviewed and approved on its own. The two branches held identical code at the split point, so the integration merge had no conflicts.

---

## 1. Pull Requests I authored

| Issue | PR | Branch | Reviewer(s) | Verdict |
|:---:|:---:|---|---|:---:|
| **Issue 1** — Engineering contract | [#42](https://github.com/copter549365/toktickit/pull/42) | `docs/lab-03-specs` | @AlphabetCG | Changes requested → **Approved & Merged** |
| Lab 2 baseline restore | [#44](https://github.com/copter549365/toktickit/pull/44) | `restore/lab2-into-lab3-staging` | (split out at @AlphabetCG's request in #43) | Merged |
| **Issue 2** — DB migration & seed (v1) | [#43](https://github.com/copter549365/toktickit/pull/43) | `feat/issue-2-database-migration` | @AlphabetCG | Changes requested → **Closed**, superseded by #44 + #45 |
| **Issue 2** — DB migration & seed (v2) | [#45](https://github.com/copter549365/toktickit/pull/45) | `feat/issue-2-database-migration-v2` | @AlphabetCG | Changes requested ×2 → **Approved & Merged** |
| **Issue 3** — Authentication | [#46](https://github.com/copter549365/toktickit/pull/46) | `feat/issue-3-authentication` | @Alongkron1234 | **Approved & Merged** |
| **Issue 4** — Requester regression | [#47](https://github.com/copter549365/toktickit/pull/47) | `feat/issue-4-requester-regression` | @Alongkron1234 | **Approved & Merged** |
| **Issue 5** — IT Staff queue | [#48](https://github.com/copter549365/toktickit/pull/48) | `feat/issue-5-staff-ticket-queue` | @Alongkron1234 | **Approved & Merged** |
| **Issue 6** — IT Staff ticket detail | [#49](https://github.com/copter549365/toktickit/pull/49) | `feat/issue-6-staff-ticket-detail` | @IEAR2548 | **Approved & Merged** |
| **Issue 7** — Admin user management | [#50](https://github.com/copter549365/toktickit/pull/50) | `feat/issue-7-admin-user-management` | @AlphabetCG | Changes requested → **Approved & Merged** |
| **Issue 8** — E2E, visual inspection & release prep | [#51](https://github.com/copter549365/toktickit/pull/51) | `feat/issue-8-e2e-release-prep` | @AlphabetCG | Fix requested → **Approved & Merged** (fix landed in the release cleanup PR) |
| Integration of Issues 2–8 | [#52](https://github.com/copter549365/toktickit/pull/52) | `restore/lab2-into-lab3-staging` → `lab3-staging` | @AlphabetCG | **Approved & Merged** |
| Release cleanup (review fixes, docs) | [#53](https://github.com/copter549365/toktickit/pull/53) | `docs/lab3-release-cleanup` | TBD | Pending review |

### 1.1. Key review comments and my responses

| PR | Reviewer comment (summary) | My response / change |
|---|---|---|
| #42 | `tests.md` marked every row `Pass` before any code existed. | Reset all rows to `Planned`; statuses were then moved to `Pass` issue by issue as features landed (`d4ddf5b`). |
| #42 | `tests.md` was missing UI style, responsive, and migration/regression rows (3 of the 8 required categories). | Added STYLE-01, RESP-01..03, MIGR-01..02, and REGR-01. |
| #42 | Cross-document links were absolute `file:///c:/Users/...` paths. | Replaced with relative `./ui-spec.md` and `./api-spec.md` links. |
| #42 | The status matrix had no permitted roles or confirmations, CSRF was claimed but undefined, the migration left `mustChangePassword = false`, some FRs had no AC, ui-spec had no real visual checklist, and ai-use.md had only 5 prompts. | Addressed all six should-fix items in the same commit. The reviewer verified with grep before approving. |
| #43 | The PR mixed restoring Lab 2 with the Issue 2 work. | Split into a pure restore (#44) plus the Issue 2 diff (#45); #43 closed as superseded. |
| #45 | `bcrypt` was missing from `package.json`, so `npm ci && prisma db seed` failed on a clean machine. | Added `bcrypt` and `@types/bcrypt` back to root and `server/` and regenerated both lockfiles. The reviewer re-ran with a fresh `npm ci` and approved. |
| #49 | LGTM on RBAC, status state machine, and Public/Internal separation (non-blocking note only). | — |
| #50 | Deactivating, demoting, or resetting a user did not affect their already-open session until the JWT expired. | `requireAuth` now re-reads `isActive`, `role`, and `mustChangePassword` from the DB on every request (`15df1e9`); API-35 added. |
| #50 | The server suite failed on DB-01 when run as a whole, because test files mutated shared DB rows in parallel. | Set `fileParallelism: false` in `server/vitest.config.ts`. |
| #51 | `e2e/lab-02/` was still in the tree but no longer ran; it drove the removed Development Requester selector, which breaks the DoD rule against disabled tests on `main`. | Deleted the suite and mapped each retired row to its Lab 3 coverage in `tests.md` §4.2 (`dc6df62`, release cleanup PR). |
| #51 | `reuseExistingServer: true` lets Playwright test a stray dev server instead of the branch (non-blocking). | Changed to `!process.env.CI` (`3538d4f`, release cleanup PR). |
| #51 | `reviewer.md` §2 still had placeholder PR links and an unnamed First Peer Reviewer (non-blocking). | Filled in §2 with my reviews of the partner's PRs and added reviewer names. |
| #51 | Mark the last-active-Administrator E2E as a UI-level check, since the server response is not the real rule (non-blocking). | Already stated in `tests.md`: the AC-13 row notes the E2E checks the UI refusal and `API-29` covers the real rule. |
| #51 | Guard `global-setup.ts` to `localhost` before it writes to the DB; use `role="status"` instead of `role="alert"` for the forbidden panel (non-blocking). | Not changed this sprint; noted for follow-up. |
| #52 | Verified the integration claim: identical trees at the split point, so the merged result equals the #51 test-run head; 144 changed files are exactly #45–#51. Asked again for `e2e/lab-02/` to be removed before the release PR. | Removed in the release cleanup PR (`dc6df62`), with `tests.md` §4.2 naming where each retired flow is now covered. |

---

## 2. Pull Requests I reviewed for my partner (@AlphabetCG)

| Issue | PR | My verdict | Review summary | Partner's response |
|:---:|:---:|:---:|---|---|
| **Issue 1** — Engineering contract | [#37](https://github.com/AlphabetCG/toktickit/pull/37) | **Approved** | Specification, tests, API, and UI docs covered everything the PR description listed. | — |
| **Issue 2** — Data model, migration & seed | [#38](https://github.com/AlphabetCG/toktickit/pull/38) | Changes requested → **Approved** | (1) Every seeded account had `mustChangePassword: false`, so there was no account to demo the mandatory first-login change. (2) The migration test only checks SQL text, not a before/after replay; say so in `tests.md`. (3) Confirm the `ALTER TYPE … ADD VALUE` migration commits before the seed runs. (4) Rows added outside the seed would keep `passwordHash = ''`. | Fixed in `c91935d`: seeded Requesters now start with `mustChangePassword = true`; `tests.md` labels the migration rows as static SQL-mechanism checks; `prisma migrate reset --force` confirmed clean; (4) documented as fail-safe, since an empty hash can never match. |
| **Issue 3** — Authentication | [#39](https://github.com/AlphabetCG/toktickit/pull/39) | Questions → **Approved** | (1) `PASSWORD_MIN` was declared separately on client and server, so the two could drift. (2) No test for a wrong current password on change-password. (3) Confirm whether `/api/tickets` is meant to require the Requester role. | Fixed in `55b70b6`: added `UI-31` (fails if the two constants differ) and `API-39` (400 on a wrong current password, and the password is not changed). (3) was intentional: POST is Requester-only, GET is scoped by ownership. |
| **Issue 4** — Requester regression & Public Comments | [#40](https://github.com/AlphabetCG/toktickit/pull/40) | Questions → **Approved** | (1) `findAccessibleTicket` gave Administrators the same Ticket access as IT Staff, which handout §4.3 says needs explicit approval in the authorization matrix. (2) The resolution-signal button had no `catch`, so a failure showed the user nothing. (3) No test covered the 409 for commenting or signalling on CLOSED/CANCELLED tickets. | Fixed in `39faae4`: (1) confirmed as approved in spec §6.1, documented at the helper, and locked by `API-41`; (2) added error feedback plus `UI-32`; (3) added `API-28` and `API-40`. |
| **Issue 5** — IT Staff Ticket Queue | [#41](https://github.com/AlphabetCG/toktickit/pull/41) | **Approved** | No changes requested. | — |
| **Issue 6** — IT Staff Ticket Detail | [#42](https://github.com/AlphabetCG/toktickit/pull/42) | **Approved** | No changes requested. | — |
| **Issue 7** — Admin user management | — | Not reviewed | The partner had not opened this PR as of 2026-10-04. | — |
| **Issue 8** — E2E & release prep | — | Not reviewed | The partner had not opened this PR as of 2026-10-04. | — |
