# Lab 5 handout context

A working digest of the CPE 334 Lab 5 handout (*Cloud Deployment and CI/CD Pipeline on GCP*, Semester 1/2026),
the *Student Guide: GCP Deployment and CI/CD* V1.1 (28 Oct 2026), and the Lab 5 Starter Kit. If this digest and
the handout disagree, the handout wins.

## At a glance

| Item | Value |
|---|---|
| Type | Group lab, same team, repository and app as the Group Project |
| Due | Sunday 15 November 2026, 23:59 |
| Points | 100 (5% of the course grade) |
| Rubric | CI and quality gate 30 · Docker and reproducible configuration 20 · GCP deployment and persistence 35 · Repeatable release pipeline 15 |
| Submit | One PDF per team on LEB2: `lab5_sec<section>_<group name>.pdf` |
| GCP access | Free Trial (USD 300) on one member's personal Gmail (not `@mail.kmutt.ac.th`); teammate added as **Editor**; never pay a prepayment or click Upgrade |
| Repository | Must be public until grading ends (R-12) |

The same GCP project and pipeline carry on into Lab 6 (a partner team runs UAT on the deployed system and the fixes
ship through this pipeline), Lab 7 (uses the CI run history) and the Final Project.

## Requirements (graded)

| ID | Requirement |
|---|---|
| R-01 | Package the app with Docker. A fresh build from a clean clone produces a working container. |
| R-02 | Read every setting from the environment. Document each variable in `.env.example` or `deployment.md`. Commit no real secret. |
| R-03 | Deploy on GCP at a public URL. The domain workflow works there through the UI, the API and the database. |
| R-04 | Persistent database. Data survives a restart and a redeploy; nothing the app needs is kept only in the container. |
| R-05 | Build and automated tests run on every relevant PR, with meaningful results. |
| R-06 | The passing check is required, so a failed check cannot enter the release path. Prove it with a failing PR from a temporary branch, without breaking the released app. |
| R-07 | Accepted releases deploy from `main` through a repeatable pipeline: reviewed change → CI → merge → deploy. A documented manual approval inside the pipeline is allowed. No cloud staging environment is required. |
| R-08 | Identify the commit of each release (tag or SHA) and document a repeatable release procedure. |
| R-09 | Issues + project board, feature/fix branches, PRs into staging reviewed by the teammate, release PR staging → main. Authors never approve their own PR; every review states a specific check, question, finding or reason. |
| R-10 | Label Lab 5 issues and PRs (`lab5`). Never delete or rewrite commits, contract revisions or CI runs. CI stays mandatory after Lab 5. |
| R-11 | Both members take part in everything (requirements, testing, AI supervision, implementation, review, deployment), recorded through issues, commits, PR authorship and reviews. Either member must be able to explain any sampled step. |
| R-12 | Public repository until grading ends. |

**Not required:** a separate cloud staging environment, Kubernetes or IaC, custom domains, load balancers,
multi-region, canary/blue-green, monitoring dashboards, load testing, real payment or messaging, or features
outside the approved scope.

## Required files

| File | Content |
|---|---|
| `Dockerfile`, `.dockerignore` (+ `docker-compose.yml`) | Builds the image; compose runs the app locally with a database |
| `.env.example` | Every variable the app reads, placeholder values only |
| CI and deploy workflows | `.github/workflows/ci-docker.yml` and `deploy.yml` |
| `docs/labs/lab-05/deployment.md` | Stack and changes from the reference; each variable (purpose, secret or not, source); build/test/run/migrate/seed commands; GCP project, region and resource names; release procedure, including how to find the running commit |

## Required checks (record file/test, command or run, result, tested commit)

| Check | Shows | Covers | Evidence |
|---|---|---|---|
| C-01 | A normal PR runs the build and all tests, and they pass | R-05 | CI run link + test summary |
| C-02 | A PR from a temporary branch with one failing test cannot be merged | R-06 | PR link; failed check and blocked merge |
| C-03 | A fresh clone builds and runs with only `.env.example` values filled in | R-01, R-02 | Commands and output |
| C-04 | On the public URL: sign in, the main business action, one rule rejection or access restriction | R-03 | Screenshots with the URL visible |
| C-05 | A record created before a restart and a redeploy is still there afterwards | R-04 | Before/after screenshots |
| C-06 | A reviewed change goes staging → main, is deployed, and the running revision matches its commit | R-07–R-10 | PR links, pipeline run, GCP revision |

## PDF: Answer Part 0–4

| Part | Points | Evidence |
|---|---|---|
| 0. Team and evidence index | – | Team number and topic; names, student IDs, GitHub usernames; repo link, submitted tag/commit, public URL and the commit it serves; contribution table with issue and PR links; evidence index (at least one row per rubric part) |
| 1. CI and quality gate | 30 | CI workflow file; passing PR (C-01); required-check setting for `main`; failing PR with blocked merge (C-02) |
| 2. Docker and reproducible configuration | 20 | Dockerfile and `.dockerignore`; fresh build + running container with its database (C-03); `.env.example` and the variable table in `deployment.md` |
| 3. GCP deployment and persistence | 35 | Public URL; domain workflow on the live URL (C-04); UI/API/DB connectivity; GCP service and database; data before and after a restart and a redeploy (C-05) |
| 4. Repeatable release pipeline | 15 | One labelled change from issue → PR into staging with a specific teammate review → release PR → CI → deploy; the run and the running revision showing the release commit (C-06); release procedure in `deployment.md` |

Links first, screenshots only where a link cannot show it. Every screenshot gets a numbered caption naming the
check or requirement and the commit, run or URL, for example *"Figure 3. C-02 (R-06): PR #14 from a temporary
branch; the required check test-and-docker failed and merging is blocked. Commit a1b2c3d."* Crop to what matters,
readable at 100%, secrets blurred. Length, prompt count, commit count and polish earn nothing. Keep the service
running until the instructor announces the end of grading.

## Definition of Done (§11)

- A fresh clone builds and runs; every setting comes from the environment; no secret in the repo, image, logs or PDF.
- The public URL serves the latest release from `main`, the domain workflow works there, and the running commit can be shown.
- Data survived a restart and a redeploy.
- CI runs on every PR into staging and `main`, and a failed required check blocks the merge.
- The latest release reached `main` through reviewed PRs and was deployed by the pipeline.
- The repository is public.
- `deployment.md` and the evidence index are complete, and either member can explain any sampled step.
- The PDF is named `lab5_sec<section>_<group name>.pdf`.

## Recommended practices (not scored, but the shortest safe path)

- Cost: alerts-only budget before any resource; Cloud Run min 0 / max ≤ 3; smallest Cloud SQL tier with storage
  auto-increase off; pause when idle (Guide Ep 9); tear down after the course (Ep 10). Cloud SQL ≈ USD 14–18/month.
- Turn on secret scanning push protection. If a secret is ever pushed: change it where it is used, add a new
  Secret Manager version, redeploy, and tell a TA. Deleting the file is not enough.
- Reference stack: Artifact Registry, Cloud Run, Cloud SQL for PostgreSQL, Secret Manager, GitHub Actions.
- Sessions and uploaded files in the database, not in the container.
- Demo accounts for each role for Lab 6 UAT, with passwords from the environment/Secret Manager, never on screen.
- Runtime secrets in Secret Manager, pipeline values in GitHub environment variables/secrets.
- Workload Identity Federation instead of JSON keys; least-privilege service accounts.
- Tag each image with the full commit SHA and deploy by digest (simplest way to meet R-08).
- Migrations in a separate job before the service update, kept additive.
- Read-only smoke test against the live URL after every deploy; never with the admin account.
- Roll back by redeploying an earlier image tag, then roll forward.
- Pin actions to full commit SHAs and let Dependabot propose updates.

## Working with AI agents (§9)

- Read every `gcloud` command or console change an agent proposes before it runs. An agent never changes billing,
  IAM or databases on its own.
- Never paste a secret, password, connection string or key file into an agent chat.
- When a deploy fails, give the agent the log excerpt and ask for the cause before asking for a fix.

## Issues ↔ Guide episodes

| Lab 5 issue | GitHub | Guide | Branch | Done when |
|---|---|---|---|---|
| 1 GCP account, project, budget | #77 | Ep 1 | none (console) | Credits visible; both members open the project |
| 2 Cloud-ready app + first `deployment.md` | #78 | Ep 2 | `refactor/issue-2-cloud-ready` | Settings from env; nothing kept only in the container |
| 3 Containerize | #79 | Ep 3 | `build/issue-3-docker` | Fresh build runs with its database (C-03) |
| 4 CI on PRs + `deploy/` | #80 | Ep 4 | `ci/issue-4-pr-checks` | PRs show build and test checks (C-01) |
| 5 First deploy | #81 | Ep 5 | none (Cloud Shell) | Public URL opens and sign-in works (C-04) |
| 6 WIF + merge gate | #82 | Ep 6 | `test/prove-gate` (throwaway) | Failing PR cannot merge (C-02) |
| 7 Auto deploy + visible release | #83 | Ep 7 | `ci/issue-7-auto-deploy`, `feat/issue-7-deploy-proof` | URL shows the change; running commit shown (C-06) |
| 8 Persistence, rollback, roll forward | #84 | Ep 8 | none (Actions + console) | Data survives restart and redeploy (C-05) |
| 9 `deployment.md` + PDF | #85 | §4.3, §12 | `docs/issue-9-deployment-doc` | Every rubric part has an evidence-index row |

## Names that must match everywhere

| What | Value | Must match in |
|---|---|---|
| CI job / required check | `test-and-docker` | `ci-docker.yml`, ruleset `protect-main` |
| GitHub environment | `demo` | GitHub settings, `deploy.yml`, WIF attribute condition (`:environment:demo`) |
| Environment variables | `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` (+ optional `SMOKE_EMAIL` var, `SMOKE_PASSWORD` secret) | `deploy.yml` |
| Cloud Run service / migration job | `toktickit` / `toktickit-migrate` | `deploy.sh`, `release.sh`, `deploy.yml`, `teardown.sh` |
| Artifact Registry repo / image | `toktickit` / `toktickit` | `deploy.sh`, `release.sh`, `deploy.yml`, `test_release_stub.sh` |
| Cloud SQL instance / database / user | `toktickit-pg` / `toktickit` / `toktickit` | `deploy.sh`, `teardown.sh` |
| Service accounts | `toktickit-runner` (runtime), `toktickit-deployer` (CI) | `deploy.sh`, WIF, `WIF_SERVICE_ACCOUNT` |
| Secrets | `toktickit-database-url`, `toktickit-admin-password`, `toktickit-demo-password` (+ `toktickit-jwt-secret` for this repo) | `deploy.sh`, `teardown.sh`, `test_deploy_stub.sh` |
| WIF pool / provider | `github-actions` / `github-main` | `WIF_PROVIDER` |

## Starter kit vs this repository

The kit assumes a TokTickIT layout that differs from ours. Copying it unchanged breaks the build or fails R-04.
Found on 10 November 2026:

| Kit assumes | This repo | Handled in |
|---|---|---|
| Attachments stored as bytes in the DB | `fs.writeFileSync` to `uploads/` (`server/src/app.ts`), lost on every Cloud Run deploy | Issue 2 |
| `/api/ready` returns `{"db":"connected"}` | No `/api/ready` | Issue 2 |
| Express serves the built SPA from `/app/client/dist` | No static serving | Issue 2 |
| `VITE_API_URL=""` means same origin | `import.meta.env.VITE_API_URL \|\| 'http://localhost:3000'` turns `""` into localhost | Issue 2 |
| Seed passwords from `ADMIN_PASSWORD` / `DEMO_USER_PASSWORD`, demo data behind `SEED_DEMO_DATA` | `prisma/seed.ts` hardcodes `InitialPassword123!` and always seeds demo data | Issue 2 |
| `server/prisma`, `npm run build` → `dist/`, `npm run prisma:seed` in `server/` | `prisma/`, `prisma.config.ts`, `generated/prisma` and the Prisma CLI at the repo root; server runs through `tsx` with no build script | Issues 3, 4 |
| Secrets: DB URL, admin and demo passwords | The app also needs `JWT_SECRET` (login throws without it) | Issue 4 (`deploy.sh`) |
| Smoke login reads `token` and sends `Authorization: Bearer` | Session is the `toktickit_session` cookie | Issue 7 |
| Prisma 5 URL `?host=/cloudsql/...&schema=public&connection_limit=3` | Prisma 7 with `@prisma/adapter-pg`; verify the socket URL works | Issues 4, 5 |
| compose: postgres 16, migrate job, server, nginx client | compose: postgres 15 and pgAdmin with password `admin` | Issue 3 |
