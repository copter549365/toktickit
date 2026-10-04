import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test file shares one PostgreSQL database. DB-01 (migration.test.ts)
    // snapshots table counts before/after re-running the seed script, and any
    // other file mutating User/Ticket/etc. rows concurrently (e.g.
    // users-admin.api.test.ts creating/deleting its own test user) makes that
    // snapshot flaky. Run files sequentially so no two suites touch the
    // database at the same time (PR #50 review).
    fileParallelism: false,
  },
});
