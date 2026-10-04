# Lab 3 — AI Use and Reflection

## 1. LLM Tooling Identity

- **Specification agent:** Google Gemini 3.8 Flash (via Antigravity IDE) / Claude 3.7 Sonnet
- **Coding agent:** Claude Code — Claude Sonnet 5 (Issues 2–7), Claude Opus 5.5 (Issue 8)
- **Context:** TokTickIT Lab 3 Users, Roles, IT Staff Ticketing, and Admin Screens (CPE 334)

---

## 2. Selected Key Prompts

| # | Phase / Task | Prompt Summary | AI Output & Assistance |
|:---:|---|---|---|
| 1 | Planning & Decomposition | "แตก issue มาให้หน่อย" (Decompose Sprint 3 into GitHub Issues) | Structured 8-issue engineering roadmap mapping to handout requirements, dependencies, and test files |
| 2 | Spec-DD Formulation | "สร้าง specification.md ให้ครบ 11 หัวข้อตาม labsheet §9 พร้อม FR-01..n และ BR-01..n" | Formulated comprehensive system requirements, business rules, acceptance criteria AC-01..17, and DoD |
| 3 | State Machine & Workflow | "กำหนด Status transition matrix ของตั๋ว 8 สถานะ พร้อม permitted roles และ required confirmations" | Formalized detailed state machine table with role-level guards, modal confirmation triggers, and validation rules |
| 4 | API Contract & CSRF | "ออกแบบ REST API สำหรับ Auth, Queue, Operational Workflows และ Admin พร้อมระบุ CSRF defense" | Produced `api-spec.md` with session cookie strategy, custom preflight header checks, full schemas, and safe error codes |
| 5 | UI Design System & Accessibility | "ขยาย Zen Green design tokens, badge styles, component states และ visual checklist ตาม labsheet §7, §8" | Produced `ui-spec.md` including amber/gold internal notes distinction, accessible keyboard navigation, and responsive rules |
| 6 | Test-DD & 8 Test Categories | "สร้าง test plan ใน tests.md ให้ครอบคลุม 8 ประเภทตาม labsheet §10 โดยตั้งสถานะเป็น Planned ทั้งหมด" | Formulated 50+ test rows across Unit, API, UI Component, UI Style, Responsive, Security, Migration, and E2E |
| 7 | Data Migration Strategy | "วางแผน database migration จาก RequesterUser ใน Lab 2 ไปสู่ User model พร้อมกฎ initial password" | Outlined safe Prisma schema migration, FK preservation, and mandatory `mustChangePassword=true` enforcement |
| 8 | Peer Review Refinement | "ปรับปรุงข้อกำหนดตาม peer review feedback: relative links, missing ACs, visual checklist, และ responsive tests" | Resolved all reviewer change requests, eliminated absolute file paths, and closed coverage gaps |
| 9 | E2E, Visual Inspection & Release Prep (Issue 8, coding agent) | "do Issue 8 and base on handout.md" | Read GitHub Issue #39 and handout §8, §10, and §12, then built the Playwright suite in `e2e/lab-03/` (41 tests, reset fixtures in a global setup) and the responsive/style checks with screenshots. Running the suite and inspecting the screenshots surfaced 8 real defects, each fixed and covered by a test (see `tests.md` §4.1), including the missing amber Internal Notes border, the unusable mobile user list, and a debounce race behind a flaky UI test. |

---

## 3. My Reflection

Using an AI Specification Agent during the early phase of Sprint 3 enforced strong discipline around Spec-Driven Development (Spec-DD) and Test-Driven Development (Test-DD). By locking down the State Transition Matrix, role permissions, and safety invariants (such as preventing self-deactivation and protecting the last active administrator) before writing code, we avoid ambiguity and architectural rework during the implementation phase. 

The peer review iteration demonstrated the value of collaborative contract refinement: catching claimed "Pass" statuses before implementation, ensuring all 8 required test categories are planned, tightening CSRF explanations, and eliminating machine-specific absolute file links. The AI helped ensure that all edge cases—such as distinguishing public comments from private internal notes and maintaining backward compatibility with Lab 2 data—were rigorously documented.

### Coding Agent: Reflection & Key Takeaways

#### 1. สิ่งที่ AI ช่วยเพิ่มประสิทธิภาพ (Strengths & Benefits)
- **TDD & Test Coverage:** AI ช่วยเขียนเทสต์ตาม contract ใน `tests.md` ได้ครบทุกชั้น ทั้ง API Integration Test (Vitest + Supertest, 172 เทสต์), UI Component Test (Vitest + RTL, 87 เทสต์) และ E2E Test (Playwright, 41 เทสต์) ครอบคลุมทั้ง Happy Path, Validation Errors, การปฏิเสธสิทธิ์ตาม Role (401/403) และ Safety Rules ของ Administrator
- **Catching Real UI Defects:** การให้ AI รัน E2E แล้วเก็บ Responsive Screenshots ทั้ง 3 ขนาดหน้าจอ ทำให้เจอ Defect จริง 8 จุด (`tests.md` §4.1) เช่น ขอบสีอำพันของ Internal Notes หายไปเพราะ class `border-0` ของ Bootstrap, หน้า User Management ใช้งานไม่ได้บนจอ 375px และ user ที่ Role ไม่ตรงเห็นข้อความ "Unable to load…" แทนหน้า Forbidden
- **Code Consistency & Architecture:** ช่วยคุม Error Codes ของ API (เช่น `LAST_ADMIN_PROTECTION`, `SELF_DEACTIVATION_PROHIBITED`), Status/Priority Badges และ Zen Green Design Tokens ให้สอดคล้องกันทั้งฝั่ง Requester, IT Staff และ Administrator

#### 2. ข้อจำกัดและสิ่งที่ต้องควบคุมด้วยตนเอง (Human-in-the-Loop Oversight)
- **Verifying Agent Claims:** AI วิเคราะห์เทสต์ `UI-11` ที่ fail แบบสุ่มผิดในครั้งแรก โดยสรุปว่า "เครื่องช้า" แล้วเพิ่ม timeout แต่เทสต์ยังพังซ้ำ พอไล่ดูจริงจึงเจอบั๊กว่า search debounce รีเซ็ตกลับไปหน้า 1 ตอน mount ข้อสรุปของ AI จึงต้องถูกตรวจสอบเหมือนโค้ดทั่วไป ไม่ใช่เชื่อทันที
- **Security & Authorization Edge Cases:** ช่องโหว่ที่ user ถูก Deactivate หรือถูกลด Role แล้วยังใช้ Session เดิมได้จนกว่า JWT จะหมดอายุ ถูกพบจาก Peer Review (PR #50) ไม่ใช่จาก AI จึงต้องแก้ให้ `requireAuth` อ่าน `isActive`, `role` และ `mustChangePassword` จาก DB ใหม่ทุก Request กฎด้านสิทธิ์จึงยังต้องมีคนคิด Scenario ที่ AI มองข้าม
- **Test Honesty:** ต้องคอยดูว่าสถานะเทสต์สะท้อนความจริง เช่น `tests.md` เคยถูกตั้งเป็น `Pass` ทั้งหมดก่อนมีโค้ด (PR #42) และกฎ Last-Active-Administrator ที่ทดสอบผ่าน E2E บนฐานข้อมูลร่วมไม่ได้ จึงเขียนกำกับชัดว่า E2E ตรวจแค่การแสดงผลฝั่ง UI ส่วนกฎจริงพิสูจน์ด้วย `API-29`
- **Git Strategy & Pull Request Discipline:** การคุม Branch Flow (Feature Branch → Staging → Main) และการแยก PR ให้ตรวจง่ายยังต้องอาศัยวินัยของคน เช่น การแยกงาน Restore Lab 2 ออกจาก Issue 2 (PR #43 → #44 + #45) และ dependency `bcrypt` ที่หายไปตอน rebuild branch ซึ่งเจอเพราะ reviewer รัน `npm ci` ใหม่บนเครื่องที่ตั้งค่าใหม่
- **Visual Design Fine-Tuning:** บางปัญหาไม่มีเทสต์อัตโนมัติจับได้ เช่น CSS ที่เหลือจาก Vite template (`#root { text-align: center }`) ทำให้ข้อความในตารางและการ์ดทุกใบจัดกึ่งกลาง ซึ่งเห็นได้จากการเปิดดู Screenshot ด้วยตาเท่านั้น
