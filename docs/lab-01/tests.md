# Lab 1 — Test Plan and Evidence

ไฟล์ test อยู่ใต้ `server/tests/lab-01/` และ `client/tests/lab-01/` ทุกเทสด้านล่างผ่านทั้งหมดบนฐานข้อมูลที่ migrate + seed แล้ว (server 4/4, client 4/4)

## ตารางรายการเทส (Test list)

| # | Test File (tests/lab-01/) | Tool | Test Description | Result |
|---|---|---|---|---|
| API-01 | `server/.../health.test.ts` | Supertest | GET /api/health returns 200 and expected JSON (status=ok, service=TokTickIT API) | pass |
| API-02 | `server/.../categories.test.ts` | Supertest | GET /api/categories returns the four seeded categories in id order | pass |
| DB-01 | `server/.../category-seed.test.ts` | Vitest + Prisma | Seed inserts the four categories in order | pass |
| DB-02 | `server/.../category-seed.test.ts` | Vitest + Prisma | Seed run twice creates no duplicates (idempotent) | pass |
| UI-01 | `client/.../App.test.tsx` | Vitest | TokTickIT heading renders | pass |
| UI-02 | `client/.../App.test.tsx` | Vitest | Success state shows System Status Online | pass |
| UI-03 | `client/.../App.test.tsx` | Vitest | API failure shows Offline + a useful error message | pass |
| UI-04 | `client/.../App.test.tsx` | Vitest | Categories from the API render on success (not hard-coded) | pass |

## ผลการรัน — server (`feature/4-category-list`)

```
$ cd server && npm test

 RUN  v2.1.9 .../toktickit/server

 ✓ tests/lab-01/category-seed.test.ts (2 tests) 166ms
 ✓ tests/lab-01/health.test.ts (1 test) 30ms
 ✓ tests/lab-01/categories.test.ts (1 test) 98ms

 Test Files  3 passed (3)
      Tests  4 passed (4)
```

## ผลการรัน — client

```
$ cd client && npm test

 ✓ tests/lab-01/App.test.tsx (4 tests) 239ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## หลักฐาน API จริง (Live endpoints)

```
$ curl http://localhost:3000/api/health
{"status":"ok","service":"TokTickIT API"}

$ curl http://localhost:3000/api/categories
[{"id":1,"name":"Account and Access"},{"id":2,"name":"Hardware"},{"id":3,"name":"Software"},{"id":4,"name":"Network"}]
```

## หลักฐาน Seed รันซ้ำได้ (idempotency)

รัน seed สองครั้งติดกัน ตาราง `Category` ยังมีเพียง 4 แถวเท่าเดิม

```
$ npm run prisma:seed && npm run prisma:seed
Seeded 4 categories.
Seeded 4 categories.

toktickit=> SELECT id, name FROM "Category" ORDER BY id;
 id |       name        
----+-------------------
  1 | Account and Access
  2 | Hardware
  3 | Software
  4 | Network
(4 rows)
```
