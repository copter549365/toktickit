# Lab 3 — AI Use and Reflection

## 1. LLM Tooling Identity

- **Primary LLM:** Google Gemini 3.8 Flash (via Antigravity IDE) / Claude 3.7 Sonnet
- **Context:** TokTickIT Lab 3 Users, Roles, IT Staff Ticketing, and Admin Screens (CPE 334)

---

## 2. Selected Key Prompts

| # | Phase / Task | Prompt Summary | AI Output & Assistance |
|:---:|---|---|---|
| 1 | Planning & Decomposition | "แตก issue มาให้หน่อย" (Decompose Sprint 3 into GitHub Issues) | Structured 8-issue engineering roadmap mapping to handout requirements, dependencies, and test files |
| 2 | Spec-DD Formulation | "Generate Lab 3 engineering specification with numbered FRs, BRs, and ACs" | Produced `specification.md` defining state machines, RBAC, safety invariants, and DoD |
| 3 | API Contract Design | "Formulate REST API contract for authentication, queue, and operational workflow" | Produced `api-spec.md` including session cookie strategy, request/response schemas, and status codes |
| 4 | UI Design System Extension | "Extend Zen Green design specifications for multi-role shell, queue, and admin" | Produced `ui-spec.md` with badge tokens, amber/gold internal notes styling, and responsive layout rules |
| 5 | Test-DD Strategy | "Construct traceability matrix and planned test catalogue" | Produced `tests.md` detailing Unit, API, Component, and E2E test cases mapped to AC-01..14 |

---

## 3. My Reflection

Using an AI Specification Agent during the early phase of Sprint 3 enforced strong discipline around Spec-Driven Development (Spec-DD). By locking down the State Transition Matrix, role permissions, and safety invariants (such as preventing self-deactivation and protecting the last active administrator) before writing code, we avoid ambiguity and architectural rework during the implementation phase. The AI helped ensure that all edge cases—such as distinguishing public comments from private internal notes and maintaining backward compatibility with Lab 2 data—were rigorously documented.
