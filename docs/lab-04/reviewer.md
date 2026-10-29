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

### 1.1. Key review comments and my responses

| PR | Reviewer comment (summary) | My response / change |
|---|---|---|
| #65 | "ครบถ้วนสำหรับ Issue นี้ดีครับ ไม่มีปัญหาครับ" (complete for this Issue, no problems): approved without change requests. | — |
| #66 | **Required:** the documented rollback does not work. After `rollback.sql`, `prisma migrate resolve --rolled-back` fails with P3012 (the migration is not in a failed state). The Lab 4 row stays in `_prisma_migrations`, so `migrate status` reports "up to date" while `ActionTaken` is gone, and `migrate deploy` never recreates it. MIG-L4-02 missed this because it ran raw SQL instead of going through Prisma. | Fixed. `rollback.sql` now deletes the migration's `_prisma_migrations` row in the same transaction, and the `migrate resolve` step is removed from the script header and spec §7.5. MIG-L4-02 now baselines the scratch database in Prisma, applies Lab 4 with `prisma migrate deploy`, asserts the row is gone after rollback, and re-applies with `migrate deploy`. I confirmed the new assertions failed before the fix. |
| #66 | *Non-blocking:* D-11 (Cascade) gives up the database-level guard that §7.2 gave as its reason for Restrict. An alternative is for test helpers to delete actions and history before deleting tickets. | Kept Cascade. The trade-off and the alternative are now recorded in D-11: no application path deletes Tickets, and the alternative means editing every Lab 3 suite's cleanup. |
| #66 | *Non-blocking:* TKT-2026-000005/000006 (RESOLVED/CLOSED) still have `requesterResolvedIndicator = true`, which contradicts BR-15. | Fixed. The migration clears the flag on RESOLVED/CLOSED/CANCELLED tickets (spec §7.3), and the seed no longer sets it on those two tickets. New tests: MIG-L4-01 (legacy rows) and MIG-L4-03 (no seeded RESOLVED/CLOSED/CANCELLED ticket keeps the flag). |

---

## 2. Pull Requests I reviewed for my partner

| PR | Title | My comments | Verdict |
|:---:|---|---|:---:|
