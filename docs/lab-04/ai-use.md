# Lab 4 — AI Use and Reflection

## 1. LLM Tooling Identity

- **Specification agent:** Claude Code (Claude Opus 5.5), working from the Lab 4 handout (`SE+Lab+4.pdf`) and its in-repo digest [handout-context.md](./handout-context.md).
- **Coding agent:** Claude Code (Claude Opus 5.5).
- **Session continuity:** a root `CLAUDE.md` records the source-of-truth order, branch flow, and Kanban steps, so every new session starts from the same rules.
- **Context:** TokTickIT Lab 4: Actions Taken, Dashboards, and Final Regression (CPE 334).

---

## 2. Selected Key Prompts

| # | Phase / Task | Prompt (original) | AI Output & Assistance |
|:---:|---|---|---|
| 1 | Planning and decomposition | "แยก issue ให้หน่อย แล้วก็เราจะทำตามกฎของไฟล์นี้เวลาทำงาน … เวลาเราปิดงานไปแล้วเปิดมาทำ issue ต่อไป แล้วแบบยัง base on ไฟล์นี้อยู่" (with the handout PDF attached) | The agent decomposed Sprint 4 into 9 dependency-ordered Issues (#56–#64) in the Lab 3 format. It also wrote `handout-context.md` (a digest of the handout, including the grading rubric) and `CLAUDE.md`, so later sessions keep following the handout. It flagged one inconsistency in the handout: Part 6 grades assign, complete, and cancel for Actions Taken, but the field list has no assignee or status. |
| 2 | Spec-DD and Test-DD (Issue 1) | "ทำ issue #56" | The agent read the Lab 3 contract, the Prisma schema, the status-transition code, and the list-query normalizers before writing. It produced `specification.md` (FR-01..22, BR-01..29, AC-01..28, DoD, decisions D-01..D-10), `api-spec.md`, `ui-spec.md`, and `tests.md` (every AC mapped to tests, all rows `Planned`). It noticed that My Tickets and the Queue keep their filters in component state, so the dashboard drill-down requirement became FR-16 (URL-driven filters). |

*(Rows 3–10 are added as Issues 2–9 are implemented.)*

---

## 3. My Reflection

*(Written at the end of the sprint: specification-agent use vs coding-agent use, what was verified by hand, and where the AI had to be corrected.)*
