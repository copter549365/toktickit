# TokTickIT

A small full-stack IT service desk built for CPE 334 (Intro to Software Engineering in the Age of AI
Agents). Requesters raise Tickets; IT Staff triage, work, and resolve them; Administrators manage
accounts. Lab 4 adds **Actions Taken**, the final ticket workflow with a resolution gate and
optimistic concurrency, and role-based **dashboards** that drill down into the detailed screens.

Stack: React 19 + TypeScript + Vite + Bootstrap 5 (client) → Node.js + Express 5 + TypeScript
(server) → Prisma ORM 7 → PostgreSQL 15.

## Prerequisites

- Node.js 20.19.0+
- Docker (PostgreSQL runs in Docker Compose)

## Setup

All Prisma commands run from the **project root**, which is where `.env` must live.

```bash
# 1. Environment
cp .env.example .env              # set DATABASE_URL if you changed the Docker credentials

# 2. Database
docker compose up -d db

# 3. Dependencies
npm install                       # root: Prisma, Playwright, seed tooling
(cd server && npm install)
(cd client && npm install)

# 4. Schema and data
npx prisma generate
npm run db:backup                 # optional on a fresh database; required before migrating real data
npx prisma migrate deploy
npx prisma db seed                # idempotent: running it twice creates no duplicates
```

> Do not put `.env` inside `server/`. `prisma.config.ts` loads dotenv from the directory it is
> invoked from, so a misplaced `.env` gives `schema.prisma: file not found`.

### Run

```bash
(cd server && npm run dev)        # http://localhost:3000  (nodemon + tsx)
(cd client && npm run dev)        # http://localhost:5173  (Vite)
```

## Accounts and demo

Every seeded account starts with the password `InitialPassword123!` and must change it at first
sign-in. After sign-in, every role lands on its **Dashboard**.

| Role | Account | What it shows |
|---|---|---|
| Administrator | `john.smith@toktickit.com` | Staff dashboard plus User Accounts cards; User Management |
| IT Staff | `michael.brown@toktickit.com` | Owns Tickets with completed Actions Taken |
| IT Staff | `alex.thompson@toktickit.com` | Has a planned action in My Open Actions |
| IT Staff | `olivia.chen@toktickit.com` | No owned Tickets or actions (all-zero "my" metrics) |
| Requester | `jennifer.anderson@toktickit.com` | Resolved Tickets waiting for her confirmation, one in progress |
| Requester | `emily.davis@toktickit.com` | A Ticket waiting for her reply, a reopened one, and a new one |
| Requester | `nina.wong@toktickit.com` | No Tickets (all-zero dashboard and the "Create your first ticket" call to action) |

A five-minute demo:
1. **Requester dashboard** (Emily): click "Waiting for Me". My Tickets opens filtered, with the
   filter in the URL and a "Filtered from Dashboard" chip. Open the Ticket and read its Actions
   Taken and Status History. They are read-only for Requesters. Jennifer's "Needs My Attention"
   list shows Resolved Tickets with "Please confirm the fix".
2. **Staff dashboard** (Alex, then Michael): check the status, workload, and IT Priority cards;
   open a My Open Actions row (it jumps to `#actions-taken`); use "View all" on Urgent Tickets.
3. **Actions Taken**: on a Ticket you own, add an action, start it, complete it with a result, and
   mark a follow-up. Open a second browser on the same action and save both to see the conflict
   banner (409 `STALE_UPDATE`).
4. **Workflow**: try to resolve with an open action. The Resolve checklist blocks it, and the API
   answers 409 `RESOLUTION_GATE_NOT_MET`. Complete the action, then resolve, close, or reopen.
5. **Administrator** (John): the User Accounts cards open User Management filtered by role and
   account status.

## Tests

| Suite | Command | Covers |
|---|---|---|
| Server unit + API | `cd server && npx vitest run` | Lab 1–4 rules, routes, authorization matrix, migration/rollback, seed, performance smoke |
| Client components | `cd client && npx vitest run` | Lab 2–4 screens with React Testing Library |
| End-to-end | `npm run test:e2e` (from the root) | Lab 3 and Lab 4 journeys, responsive and accessibility checks, screenshots |

Run the server and E2E suites against the Docker database after `migrate deploy` and `db seed`.
The server suite runs its files one at a time, because they share one database.

```bash
npx playwright install chromium   # once
npm run test:e2e                  # starts the client and server dev servers if they are not running
```

- `e2e/lab-03/global-setup.ts` resets the dedicated `e2e.*@toktickit.com` accounts before every
  run, so runs repeat cleanly and never change the seeded accounts' passwords.
- Every Lab 4 spec fails on any `console.error`, page error, or placeholder text
  (`e2e/lab-04/fixtures.ts`).
- Screenshots go to `artifacts/lab-04/screenshots/{requester-dashboard,staff-dashboard,actions-taken,workflow}/`
  and `artifacts/lab-03/screenshots/`.
- Results and traceability: `docs/lab-04/tests.md`.

## Migration, backup, and rollback

The Lab 4 migration (`prisma/migrations/20261030000000_lab4_actions_taken_and_workflow/`) keeps all
existing data. Legacy Tickets get `version = 1`, zero Actions Taken, and one "migrated" history
entry. `itPriority` and `resolvedAt` are backfilled (spec §7).

```bash
npm run db:backup                 # pg_dump to backups/toktickit-<timestamp>.dump

# Restore a backup (replaces the database contents):
docker compose exec -T db pg_restore -U toktickit_user -d toktickit_db --clean --if-exists < backups/<file>.dump

# Roll back the Lab 4 schema only (Lab 1–3 data is kept; Actions Taken and history are dropped):
docker compose exec -T db psql -U toktickit_user -d toktickit_db < prisma/migrations/20261030000000_lab4_actions_taken_and_workflow/rollback.sql
npx prisma migrate deploy         # re-applies Lab 4 later
```

## Project structure

```
toktickit/
├── .env.example          ← copy to .env (git-ignored)
├── prisma.config.ts      ← Prisma 7 config (loaded from the root)
├── prisma/               ← schema, migrations (with the Lab 4 rollback.sql), idempotent seed
├── scripts/db-backup.mjs ← pg_dump inside the db container
├── server/               ← Express API (src/app.ts, src/utils/*) and its Vitest suites (tests/lab-0N)
├── client/               ← React app (src/screens, src/components, src/hooks) and its tests
├── e2e/lab-03, e2e/lab-04 ← Playwright journeys, responsive, accessibility, and hardening specs
├── artifacts/lab-0N/     ← screenshot evidence from each lab's E2E suite
└── docs/lab-0N/          ← per-lab engineering contract: specification, API/UI specs, tests, reviews, AI use
```

The Lab 4 contract is in `docs/lab-04/`: `specification.md` (requirements, business rules,
acceptance criteria, and decisions D-01..D-19), `api-spec.md`, `ui-spec.md`, `tests.md`,
`reviewer.md`, and `ai-use.md`.

### Lab 2 E2E suite (retired)

The Lab 2 Playwright suite logged in through the Development Requester selector, which Lab 3
replaced with real authentication, so it was removed at the Lab 3 release. Its flows are covered
under real auth by `server/tests/lab-03/requester-regression.test.ts` and the E2E suites. Its
screenshots remain in `artifacts/lab-02/screenshots/`.
