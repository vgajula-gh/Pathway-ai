# AGENTS.md — instructions for Codex and other coding agents

You are building **Pathway AI**, an AI companion for high school students. Read `docs/01-PRD.md` and `docs/04-ARCHITECTURE.md` before larger changes. The product is a student-success companion, NOT a planner.

## Commands
- Install: `npm install`
- DB: `npm run db:setup` (local SQLite push + seed). After schema edits, use `npm run db:push --workspace apps/api` locally and `npm run db:sync:replit` in the Replit workspace for the development PostgreSQL schema. Replit Publish applies the production schema diff.
- Dev: `npm run dev` · API only: `npm run dev:api` · Web only: `npm run dev:web`
- Tests: `npm test` (must pass before you finish a task)
- Types: `npm run typecheck`

## Architecture rules (do not break)
1. **Deterministic code decides facts; AI decides language and judgment.** Date math, recurrence, conflicts, free time, eligibility, approval checks and verification live in `apps/api/src/domain/*`. Never ask the model to compute these.
2. **Every change goes through a proposal.** The agent may only call `propose_actions`; execution happens in `lib/proposals.ts` after the student approves: revalidate → execute in a transaction → verify → audit. Do not add tools that write data directly.
3. **No external side effects without a separate explicit user action.** No emails, registrations, submissions or third-party calendar writes from the server. Calendar files are downloaded by the student.
4. **Never claim success early.** Return the real status (`VERIFIED` / `FAILED`) and show it.
5. **Never fabricate.** No invented deadlines, links, news, achievements or admissions predictions. Unverified opportunities must say so (`sourceCheckedAt == null`).
6. **Minors' privacy.** Collect the minimum; no sensitive inferences; private by default; everything exportable and deletable. Log state-changing actions to `AuditEvent`.
7. **Academic integrity.** The coach teaches; it does not produce graded work.

## LLM providers
- The app runs on **Claude, OpenAI or Ollama**, chosen by `LLM_PROVIDER`. Only `apps/api/src/agent/llm/*` may import a vendor SDK; everything else uses the `LLM` interface (`runTools`, `json`, `text`).
- Prompts, tools, guardrails and the approval flow are provider-neutral. A new provider = one adapter file + a line in `llm/index.ts` + a test.
- Any feature must keep working with AI disabled (deterministic features stay available).

## Code conventions
- TypeScript strict everywhere. Validate all inputs with zod at route boundaries.
- Local datetimes are strings `YYYY-MM-DDTHH:MM` in the student's timezone (see `domain/time.ts`).
- JSON columns are stored as strings (SQLite/Postgres portability); parse with `j()` from `lib/db.ts`.
- New domain logic needs unit tests in `apps/api/test`.
- UI: reuse classes in `apps/web/src/styles/app.css` and tokens in `docs/03-DESIGN-SYSTEM.md`. Keep one primary action per card. Plain, friendly, student-facing copy.
- Accessibility: every control has a label; keyboard reachable; respect `prefers-reduced-motion`.

## Definition of done
Tests and typecheck pass; acceptance criteria in `docs/10-BACKLOG-AND-TESTS.md` for the story are met; docs updated if contracts changed (`docs/06-API.md`, `docs/openapi.yaml`, `docs/07-AGENT-AND-TOOLS.md`).
