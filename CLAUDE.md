# TokTickIT — working rules for Claude

CPE 334 lab project. Stack: React client (`client/`), Express + Prisma/PostgreSQL server (`server/`, with `prisma/`,
`prisma.config.ts` and `generated/prisma` at the repo root), Playwright E2E (`e2e/`).
Current sprint: **Lab 5** (Cloud Deployment and CI/CD on GCP), due Sunday 15 November 2026, 23:59.

## Source of truth, in order
1. `docs/labs/lab-05/handout-context.md` (digest of the Lab 5 handout and the Student Guide V1.1: R-01 to R-12,
   checks C-01 to C-06, rubric parts 0–4, and the gaps between the starter kit and this repo)
2. `docs/labs/lab-05/deployment.md` (stack, environment variables, commands, GCP names, release procedure)
3. The application contract in `docs/lab-04/` (and the earlier `docs/lab-02/`, `docs/lab-03/`). Lab 5 adds no
   product features: change application behaviour only where cloud readiness needs it (handout §4.2).

The Lab 5 Starter Kit is a template, kept outside the repo at
`C:\Users\copte\Downloads\02_lab5-starter-kit\toktickit-lab5-starter`. Copy a kit file only in the issue that needs
it, then adapt it to this repo's layout. If the handout, the Guide and the kit disagree, the handout wins.

Lab 5 issues: "Lab 5 Issue 1" to "Lab 5 Issue 9" are GitHub #77 to #85, so Issue N is #(76+N).
Every Lab 5 issue and PR carries the `lab5` label (R-10).

Kanban: GitHub Project #4 "TokTikIT" (owner `copter549365`, project id `PVT_kwHOBOp45c4BfwoR`). Status columns are
Backlog → Specified → Started → PR Review → Fixing → Done. Move the card when the work changes stage:
`gh project item-edit --project-id PVT_kwHOBOp45c4BfwoR --id <item> --field-id PVTSSF_lAHOBOp45c4BfwoRzhaBOpY --single-select-option-id <opt>`
(get the item ids with `gh project item-list 4 --owner copter549365 --format json`).
Option ids: Backlog f75ad846, Specified 61e4505c, Started 47fc9ee4, PR Review df73e18b, Fixing 6e5c438d, Done 98236657.

## Starting an issue (every new session)
1. `gh issue view <N>` to read its scope and done-when criteria.
2. Read the matching part of `docs/labs/lab-05/handout-context.md`.
3. `git fetch && git checkout lab5-staging && git pull`, then branch with the name in the issue body
   (for example `refactor/issue-2-cloud-ready`, `build/issue-3-docker`, `ci/issue-4-pr-checks`; `docs/...` for docs).
   Console-only issues (1, 5, 6, 8) have no branch: close them with a comment holding the evidence.
4. Move the Kanban card to **Started**.
5. Code changes: write or extend the tests first, then implement.

## Finishing an issue
- Every test passes: server and client tests, plus E2E when the UI changed. No Lab 1–4 regressions.
- Update `docs/labs/lab-05/deployment.md` when a variable, command, resource name or release step changes.
- Open the PR into **`lab5-staging`** (never straight into `main`) with the `lab5` label and `Part of #<N>`.
  The teammate reviews it; the author never approves their own PR, and each review states a specific check or finding.
- Kanban: **PR Review** when the PR is opened, **Fixing** while addressing review comments, **Done** after the merge.
- Release: a PR from `lab5-staging` into `main`. Every merge into `main` is a release that the pipeline deploys.
  Sync `lab5-staging` with `main` after each release, because the ruleset requires up-to-date branches.

## Non-negotiables
- The repository is public. Never commit `.env`, passwords, connection strings, keys, or screenshots or logs that
  show them. Check `git status` and the diff before every commit.
- Never read, print or paste a secret value (no `gcloud secrets versions access`, no "View secret value").
- Read every `gcloud` command before it runs, and never change billing, IAM or a database without the user's go-ahead.
  Run `deploy/deploy.sh` and `deploy/teardown.sh` with `DRY_RUN=1` first. Never create a service account key.
- Keep the CI job name `test-and-docker`, the environment name `demo`, and the variables `GCP_PROJECT_ID`,
  `GCP_REGION`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`.
- Nothing the app needs lives only in the container: data, attachments and sessions survive a restart and a redeploy.
- Migrations stay additive and preserve existing data, so an older image still works after a rollback.
  The seed stays idempotent, and its passwords come from the environment, never from code.
- Never rewrite history, force-push, or delete CI runs (R-10). Do not pause or tear down GCP before grading ends.
- Carried over from the app contract: the backend enforces every write permission, stale updates return 409,
  and the Zen Green design rules still apply to any UI change.
