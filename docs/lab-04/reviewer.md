# Lab 4 — Peer Review Record

**Author:** @copter549365

**Reviewers**

| Role | Name | Student ID | GitHub |
|---|---|---|---|
| First Peer Reviewer | Napat Utabuawong | 67070501041 | [@AlphabetCG](https://github.com/AlphabetCG) |
| Second Peer Reviewer | Alongkron Kaeprom | 67070501050 | [@Alongkron1234](https://github.com/Alongkron1234) |
| Additional Reviewer | Paphangkorn Luanseng | 67070501083 | [@IEAR2548](https://github.com/IEAR2548) |

**Branch flow:** Issue branch → `lab4-staging` → `main` (release PR).

---

## 1. Pull Requests I authored

| Issue | PR | Branch | Reviewer(s) | Verdict |
|:---:|:---:|---|---|:---:|
| **Issue 1** — Sprint 4 engineering contract ([#56](https://github.com/copter549365/toktickit/issues/56)) | [#65](https://github.com/copter549365/toktickit/pull/65) | `docs/lab-04-specs` | @AlphabetCG | **Approved & Merged** |
| **Issue 2** — Actions Taken DB, migration & seed ([#57](https://github.com/copter549365/toktickit/issues/57)) | [#66](https://github.com/copter549365/toktickit/pull/66) | `feat/issue-2-actions-taken-db` | @AlphabetCG | Changes Requested → **Approved & Merged** |
| **Issue 3** — Actions Taken API & authorization ([#58](https://github.com/copter549365/toktickit/issues/58)) | [#67](https://github.com/copter549365/toktickit/pull/67) | `feat/issue-3-actions-taken-api` | @AlphabetCG | **Approved & Merged** |
| **Issue 4** — Actions Taken UI ([#59](https://github.com/copter549365/toktickit/issues/59)) | [#68](https://github.com/copter549365/toktickit/pull/68) | `feat/issue-4-actions-taken-ui` | @AlphabetCG | **Approved & Merged** |
| **Issue 5** — Ticket workflow & resolution gate ([#60](https://github.com/copter549365/toktickit/issues/60)) | [#69](https://github.com/copter549365/toktickit/pull/69) | `feat/issue-5-ticket-workflow` | @AlphabetCG | Changes Requested → **Approved & Merged** |
| **Issue 6** — Requester Dashboard ([#61](https://github.com/copter549365/toktickit/issues/61)) | [#70](https://github.com/copter549365/toktickit/pull/70) | `feat/issue-6-requester-dashboard` | @AlphabetCG | **Approved & Merged** |
| **Issue 7** — IT Staff & Administrator Dashboard ([#62](https://github.com/copter549365/toktickit/issues/62)) | [#71](https://github.com/copter549365/toktickit/pull/71) | `feat/issue-7-staff-dashboard` | @AlphabetCG | **Approved & Merged** |
| **Issue 8** — Final hardening, regression & accessibility ([#63](https://github.com/copter549365/toktickit/issues/63)) | [#72](https://github.com/copter549365/toktickit/pull/72) | `feat/issue-8-final-hardening` | @AlphabetCG | **Approved & Merged** |
| **Issue 9** — E2E suite, screenshots & release ([#64](https://github.com/copter549365/toktickit/issues/64)) | *(pending)* | `feat/issue-9-e2e-release` | | Pending |

### 1.1. Key review comments and my responses

| PR | Reviewer comment (summary) | My response / change |
|---|---|---|
| #65 | "ครบถ้วนสำหรับ Issue นี้ดีครับ ไม่มีปัญหาครับ" (complete for this Issue, no problems): approved without change requests. | — |
| #66 | **Required:** the documented rollback does not work. After `rollback.sql`, `prisma migrate resolve --rolled-back` fails with P3012 (the migration is not in a failed state). The Lab 4 row stays in `_prisma_migrations`, so `migrate status` reports "up to date" while `ActionTaken` is gone, and `migrate deploy` never recreates it. MIG-L4-02 missed this because it ran raw SQL instead of going through Prisma. | Fixed. `rollback.sql` now deletes the migration's `_prisma_migrations` row in the same transaction, and the `migrate resolve` step is removed from the script header and spec §7.5. MIG-L4-02 now baselines the scratch database in Prisma, applies Lab 4 with `prisma migrate deploy`, asserts the row is gone after rollback, and re-applies with `migrate deploy`. I confirmed the new assertions failed before the fix. |
| #66 | *Non-blocking:* D-11 (Cascade) gives up the database-level guard that §7.2 gave as its reason for Restrict. An alternative is for test helpers to delete actions and history before deleting tickets. | Kept Cascade. The trade-off and the alternative are now recorded in D-11: no application path deletes Tickets, and the alternative means editing every Lab 3 suite's cleanup. |
| #69 | Verified on a fresh DB: server 339/339, client 115/115, E2E 51/51 (the 338/339 in the PR came from stale dev-DB data). The gate (409 with unmet keys), the Requester's 403 on the staff route, the absence of history write routes, and Requester history access were all confirmed through the live API. **Required (1):** a Requester cancelling a NEW Ticket with a PLANNED action recorded the *Requester* as `lastUpdatedBy` of the auto-cancelled action, contradicting handout §4.3 and AC-08. Suggested 409 instead. | Fixed (D-16). A Requester cancel with an open action now gets `409 TICKET_HAS_OPEN_ACTIONS` and nothing changes. Completed and cancelled actions don't block and stay untouched. The Requester detail omits `CANCELLED` from `permittedNextStatuses`, so the button is hidden. New API, unit, and UI tests were seen failing first. |
| #69 | **Required (2):** `cancelTicket()` and `markProblemAppearsResolved()` don't send `expectedVersion`, contradicting D-03. A Requester could cancel from a stale page after staff had claimed the Ticket. | Fixed. Both now send `ticket.version`. A `409 STALE_UPDATE` explains what happened and reloads the Ticket, and the UI tests cover both calls. |
| #72 | "โค้ดดีและพร้อม merge ไม่เจอบั๊กที่ต้องแก้ก่อน merge" (good code, ready to merge, no bugs to fix first): approved without change requests. | — |
| #71 | "ตรงตาม spec และพร้อมสำหรับการ merge" (matches the spec, ready to merge): approved without change requests. | — |
| #70 | "Test ผ่านไม่มีปัญหา สามารถ Merge ได้เลยครับ" (tests pass, no problems, OK to merge): approved without change requests. | — |
| #69 | Re-review after the fixes: "ถูกต้องและครบถ้วนสมบูรณ์ครับ" (correct and complete): approved. | — |
| #68 | "ครบถ้วนครับ" (complete): approved without change requests. | — |
| #67 | "ไม่มีปัญหา สามารถ merge ได้เลยครับ" (no problems, OK to merge): approved without change requests. | — |
| #66 | *Non-blocking:* TKT-2026-000005/000006 (RESOLVED/CLOSED) still have `requesterResolvedIndicator = true`, which contradicts BR-15. | Fixed. The migration clears the flag on RESOLVED/CLOSED/CANCELLED tickets (spec §7.3), and the seed no longer sets it on those two tickets. New tests: MIG-L4-01 (legacy rows) and MIG-L4-03 (no seeded RESOLVED/CLOSED/CANCELLED ticket keeps the flag). |

---

## 2. Pull Requests I reviewed for my partner

| PR | Title | My comments | Verdict |
|:---:|---|---|:---:|
