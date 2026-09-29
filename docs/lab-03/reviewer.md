# Lab 3 — Peer Review Record

**Author:** @copter549365

**Reviewers**

| Role | Name | Student ID | GitHub |
|---|---|---|---|
| First Peer Reviewer | — | 67070501041 | [@AlphabetCG](https://github.com/AlphabetCG) |
| Second Peer Reviewer | Alongkron Kaeprom | 67070501050 | [@Alongkron1234](https://github.com/Alongkron1234) |
| Additional Reviewer | — | — | [@IEAR2548](https://github.com/IEAR2548) |

Branch flow: each Issue branch → `restore/lab2-into-lab3-staging` (the Lab 2 baseline restored into Lab 3, PR #44) → `lab3-staging` → `main` (release PR).

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
| **Issue 8** — E2E, visual inspection & release prep | [#51](https://github.com/copter549365/toktickit/pull/51) | `feat/issue-8-e2e-release-prep` | TBD | Pending review |

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

---

## 2. Pull Requests I reviewed for my partner (@AlphabetCG)

> To be completed with the partner's Lab 3 PR links and my review summaries.

| Issue | PR Link | Review Summary & Action |
|:---:|---|---|
| **Issue 1** | https://github.com/AlphabetCG/toktickit/pull/... | docs: Lab 3 sprint engineering contract |
| **Issue 2** | https://github.com/AlphabetCG/toktickit/pull/... | feat: Lab 3 database increment, migration & seed |
| **Issue 3** | https://github.com/AlphabetCG/toktickit/pull/... | feat: Authentication & mandatory password change |
| **Issue 4** | https://github.com/AlphabetCG/toktickit/pull/... | feat: Requester regression & public comments |
| **Issue 5** | https://github.com/AlphabetCG/toktickit/pull/... | feat: IT Staff ticket queue |
| **Issue 6** | https://github.com/AlphabetCG/toktickit/pull/... | feat: IT Staff ticket detail & operational workflow |
| **Issue 7** | https://github.com/AlphabetCG/toktickit/pull/... | feat: Administrator user management & safety rules |
| **Issue 8** | https://github.com/AlphabetCG/toktickit/pull/... | test: E2E suite, responsive visual inspection & release prep |
