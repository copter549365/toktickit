# TokTick It
A tiny full-stack IT service desk vertical slice built for CPE 334 (Intro to Software Engineering in the Age of AI Agents), Lab 1.

Stack: React + TypeScript + Vite + Bootstrap (client) → Node.js + Express + TypeScript (server) → Prisma ORM v7 → PostgreSQL.

## Prerequisites

- Node.js 20.19.0+
- Docker (for local PostgreSQL via Docker Compose)

## Setup Instructions

### 1. Environment Variables

All Prisma CLI commands are run from the **project root**, so `.env` must live at the root:

```bash
# From the project root
cp .env.example .env
# Edit .env and set DATABASE_URL if needed
```

> **Note:** Do NOT place `.env` inside `server/`. `prisma.config.ts` loads dotenv from the working
> directory it is invoked from (the project root). Placing `.env` elsewhere will cause
> `schema.prisma: file not found` errors.

### 2. Database (Docker)

```bash
# From the project root
docker compose up -d
```

### 3. Prisma — Generate & Migrate

```bash
# From the project root
npx prisma generate
npx prisma migrate deploy
npx prisma db seed       # idempotent: categories, systems, 10 users, 8 tickets, comments & notes
```

Seeded accounts all start with the initial password `InitialPassword123!` and must change it at
first login. For example: `john.smith@toktickit.com` (Administrator), `michael.brown@toktickit.com`
(IT Staff), and `jennifer.anderson@toktickit.com` (Requester).

### 4. Frontend (Client)

```bash
cd client
npm install
npm run dev       # start Vite dev server
npm run test      # run Vitest
```

### 5. Backend (Server)

```bash
cd server
npm install
npm run dev       # start Express server (nodemon + tsx)
npm run test      # run Vitest + Supertest
```

## Project Structure

```
toktickit/
├── .env                  ← environment variables (git-ignored)
├── .env.example          ← template — copy to .env
├── prisma.config.ts      ← Prisma v7 config (loaded from root)
├── prisma/
│   └── schema.prisma
├── generated/
│   └── prisma/           ← generated Prisma Client (git-ignored)
├── client/               ← React + Vite + Bootstrap frontend
├── server/               ← Express + TypeScript backend
├── e2e/lab-03/           ← Lab 3 Playwright E2E + responsive/style suite (Issue 8)
├── e2e/lab-02/           ← Lab 2 suite (historical; drove the removed Development Requester selector)
├── artifacts/lab-0{2,3}/ ← screenshot evidence captured by each lab's E2E suite
└── docs/lab-0{1,2,3}/    ← per-lab engineering contract (spec, tests, UI/API specs, reviewer, AI use)
```
## Tests
```
cd server && npm test
cd client && npm test
```

### End-to-end & responsive visual tests (Lab 3, Issue 8)

`e2e/lab-03` runs the Lab 3 journeys against the real Express API and PostgreSQL: authentication and
the mandatory password change, the IT Staff ticket lifecycle (queue → claim → IT Priority → status →
Public Comments vs Internal Notes → resolution), and Administrator user management with its safety
rules. It also checks every major screen at 1280/768/375px for overflow, clipped labels, field
styling, and focus. `global-setup.ts` resets the dedicated `e2e.*@toktickit.com` accounts first,
so runs are repeatable and never touch the seed accounts above.

```bash
# From the project root, one-time setup
npm install
npx playwright install chromium

docker compose up -d db
npx prisma migrate deploy && npx prisma db seed
npm run test:e2e          # starts the client/server dev servers if they aren't running
```

Screenshots go to `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/`
(listed in `docs/lab-03/ui-spec.md` §9). Results and traceability are in `docs/lab-03/tests.md`.

### End-to-end & responsive visual tests (Lab 2, Issue 7 — historical)

> Lab 3 replaced the Development Requester selector these specs drive, so they no longer run against
> the current app. Their Requester flows are covered under real authentication by
> `server/tests/lab-03/requester-regression.test.ts` and the Lab 3 E2E suite.

The Playwright suite in `e2e/lab-02` exercises the full Requester journey (Selection → Create Ticket →
My Tickets → Ticket Detail → attachment lifecycle) and captures desktop/tablet/mobile screenshots against
the real Express API and PostgreSQL — not mocks — matching `docs/lab-02/tests.md`'s E2E-01..05 and
RESP-01..03 rows.

```bash
# From the project root, one-time setup
npm install
npx playwright install chromium

git checkout lab2-staging && npm run test:e2e   # the Lab 2 config and app
```

Screenshot evidence is written to `artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`
per `docs/lab-02/ui-spec.md` §9. `npx playwright show-report` opens the HTML report from the last run.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Bootstrap 5 |
| Backend | Node.js + Express 5 + TypeScript |
| ORM | Prisma ORM v7 + `@prisma/adapter-pg` |
| Database | PostgreSQL (local via Docker Compose) |
| Testing | Vitest + Supertest |
