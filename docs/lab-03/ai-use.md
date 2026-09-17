# Lab 3 — AI Use and Reflection

## 1. LLM Tooling Identity

- **Primary LLM:** Google Gemini 3.8 Flash (via Antigravity IDE) / Claude 3.7 Sonnet
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

---

## 3. My Reflection

Using an AI Specification Agent during the early phase of Sprint 3 enforced strong discipline around Spec-Driven Development (Spec-DD) and Test-Driven Development (Test-DD). By locking down the State Transition Matrix, role permissions, and safety invariants (such as preventing self-deactivation and protecting the last active administrator) before writing code, we avoid ambiguity and architectural rework during the implementation phase. 

The peer review iteration demonstrated the value of collaborative contract refinement: catching claimed "Pass" statuses before implementation, ensuring all 8 required test categories are planned, tightening CSRF explanations, and eliminating machine-specific absolute file links. The AI helped ensure that all edge cases—such as distinguishing public comments from private internal notes and maintaining backward compatibility with Lab 2 data—were rigorously documented.
