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
npx prisma migrate dev   # once you have models in schema.prisma
# or: npx prisma db push  (for quick iteration without migration history)
```

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
└── server/               ← Express + TypeScript backend
```
## Tests
```
cd server && npm test
cd client && npm test
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Bootstrap 5 |
| Backend | Node.js + Express 5 + TypeScript |
| ORM | Prisma ORM v7 + `@prisma/adapter-pg` |
| Database | PostgreSQL (local via Docker Compose) |
| Testing | Vitest + Supertest |
