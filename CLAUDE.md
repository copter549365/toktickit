# TokTickIT — working rules for Claude

CPE 334 lab project. Stack: React client (`client/`), Express + Prisma/PostgreSQL server (`server/`, `prisma/`),
Playwright E2E (`e2e/`). Current sprint: **Lab 4** (Actions Taken, Dashboards, Final Regression).

## Source of truth, in order
1. `docs/lab-04/specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` (the engineering contract)
2. `docs/lab-04/handout-context.md` (digest of the Lab 4 handout PDF, including grading parts 1–9)
3. Earlier contracts in `docs/lab-02/` and `docs/lab-03/`, which still apply unless Lab 4 overrides them

Lab 4 issues: "Issue 1" to "Issue 9" in the issue bodies are GitHub #56 to #64, so Issue N is #(55+N).

Kanban: GitHub Project #4 "TokTikIT" (owner `copter549365`). Status columns are Backlog → Specified → Started →
PR Review → Fixing → Done. Move the card when the work changes stage:
`gh project item-edit --project-id <id> --id <item> --field-id PVTSSF_lAHOBOp45c4BfwoRzhaBOpY --single-select-option-id <opt>`
(get the ids with `gh project view 4 --owner copter549365 --format json` and `gh project item-list 4 --owner copter549365 --format json`).
Option ids: Backlog f75ad846, Specified 61e4505c, Started 47fc9ee4, PR Review df73e18b, Fixing 6e5c438d, Done 98236657.

Do not add features outside the approved contract (handout §4.2). If an issue needs a decision the contract
doesn't cover, ask, then record it in specification.md §11.

## Starting an issue (every new session)
1. `gh issue view <N>` to read its scope and acceptance criteria.
2. Read the relevant sections of the Lab 4 contract plus `handout-context.md`.
3. `git fetch && git checkout lab4-staging && git pull`, then branch `feat/issue-<N>-<slug>`
   (or `docs/...` for doc-only work).
4. Move the Kanban card to **Started**.
5. TDD: write or extend the tests listed in `tests.md` for that issue first, then implement.

## Finishing an issue
- Every test passes: server and client unit/API tests, plus E2E when the UI changed. No Lab 1–3 regressions.
- Update `docs/lab-04/tests.md` (Final column, real test file paths) and add any new AC or BR to the spec.
- Add the key prompts to `docs/lab-04/ai-use.md`.
- Put screenshots in `artifacts/lab-04/screenshots/<area>/` (desktop, tablet, mobile).
- Open the PR into **`lab4-staging`** (never straight into `main`), linking with `Closes #<N>`.
- Add a row to `docs/lab-04/reviewer.md` for the PR.
- Kanban: move the card to **PR Review** when the PR is opened, **Fixing** while addressing review comments, and **Done** after the merge.
- Release: open a PR from `lab4-staging` into `main` after all issues are done.

## Non-negotiables
- The backend enforces every write permission. Hiding a control in the UI is not authorization.
- Stale or concurrent updates return 409 and must not overwrite silently.
- A Requester's "appears resolved" signal is advisory and never sets status to Resolved.
- Migrations preserve existing data, and the seed stays idempotent.
- Zen Green design language: reuse existing components and tokens, keep keyboard and focus support, never use
  color as the only cue, and no horizontal scroll at mobile width.
