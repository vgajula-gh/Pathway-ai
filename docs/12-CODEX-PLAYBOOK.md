# 12 · Codex Playbook — prompts to continue the build

Use these one at a time in Codex (cloud task or CLI) from the repo root. Each prompt assumes Codex reads `AGENTS.md`. Review every diff; keep tasks small.

## 0. First run
> Read AGENTS.md and docs/01–07. Install dependencies, run `npm run db:setup`, `npm test` and `npm run typecheck`. Fix anything that fails without changing behavior. Summarize the architecture in 10 bullets.

## 1. API integration tests
> Add Fastify `app.inject()` integration tests for Journey A: onboard a student with sampleWeek, GET /api/opportunities, POST /api/opportunities/cac/prep, approve it, and assert VERIFIED, a reminder event exists, a goal with 2 milestones exists, and an AuditEvent "Verified" was written. Also test that adding a conflicting event before approval yields FAILED and no new rows. Use a temporary SQLite file.

## 2. Persist snooze and dismiss
> Persist "Later" (snooze) per student per day in a new `Student.settings.snoozedOn` field. Today should hide the next-step card when snoozed. Update docs/06-API.md.

## 3. Streaming Buddy
> Convert POST /api/buddy/messages to Server-Sent Events: stream text deltas and emit `tool` events with labels as tools run. Update Buddy.tsx to render tokens live and a one-line status. Keep the non-streaming path for tests.

## 4. Real authentication
> Replace the dev `x-student-id` identity with Auth.js (or Clerk). Add an age gate at onboarding (13+ by default; config flag for consent flow). Protect every route. Keep a seed test user for local dev.

## 5. Opportunity sourcing
> Implement docs/08-OPPORTUNITY-AND-NEWS-SOURCING.md steps 1–5 as a job: an allow-list file of official URLs, fetch + snapshot, Claude JSON extraction into Opportunity, verification rules, set sourceCheckedAt. Never overwrite verified fields with nulls. Add tests for normalization and expiry.

## 6. Agent evals
> Create `apps/api/evals/` with 20 golden scenarios from docs/07 and a runner that calls runBuddy against a seeded student and checks assertions (e.g., no add_event overlapping practice; reply contains "approval"). Make it runnable with `npm run evals`.

## 7. Accessibility & polish
> Run axe on every page, fix issues, ensure keyboard-only completion of Journey A, add visible focus states, and verify reduced-motion behavior.

## 8. Postgres + deploy
> Switch Prisma to Postgres with migrations, add a Dockerfile for the API, a GitHub Actions CI (install, typecheck, test, build), and deployment notes for Render (API) and Vercel (web).

## 9. News ingestion
> Implement the News for you pipeline in docs/08 as a scheduled job writing NewsStory rows (topic, headline, neutral one-sentence summary, source, url, publishedAt, checkedAt). Use an allow-list of sources. Never store a story without a source and URL. Add tests for dedupe and 30-day pruning.

## 10. Learn from feedback
> When a student taps "Not for me" on an opportunity, ask why (too far, not my thing, no time, cost). Store reasons per student and adjust scoreOpportunity weights for that student. Show "Because you said…" in the why line. Add unit tests.

## 11. Week-ahead check-in
> Add a Sunday "Week ahead" card on Today: use dayCapacity for the next 7 days, flag overloaded days, and create one proposal that balances study sessions around fixed commitments and downtime. Reuse createProposal; add tests.

## 12. Growth insights
> In Grow, compute top skills from portfolio entries and compare with goal skills; suggest one eligible opportunity that builds a missing skill, with a plain-language reason.

## 13. Adopt LangGraph.js (when needed)
> Re-implement the Buddy loop with LangGraph.js behind the existing `LLM` interface: an orchestrator node, one node per tool, an `interrupt` before executing any proposal so approval can pause and resume across sessions, and a checkpointer backed by Postgres. Keep tools, prompts, the approval service and all tests unchanged; both providers must pass the evals.

## 14. Provider parity evals
> Run the evals suite against `LLM_PROVIDER=anthropic` and `LLM_PROVIDER=openai`, report differences, and fix adapter issues (tool-call parsing, JSON mode, images) without changing prompts or guardrails.

## Prompting tips
State the acceptance test up front · point to exact files · ask Codex to update docs when contracts change · ask for a short summary of what changed and how to verify it.
