# Pathway AI

**Make the most of today. Build a better tomorrow.**

Pathway AI is an AI companion that helps high school students (grades 9–12) get more value from their high school years. It helps them **Discover** opportunities that fit, **Simplify** everyday logistics, **Grow** skills and reflection, and **Prepare** for what comes next. It is *not* a planner; simplification is an enabling capability.

This repository is a working starter kit: a TypeScript API (Fastify + Prisma + an LLM agent on Claude or OpenAI), a React web app with an Oura-inspired calm UI, and the product/architecture documents needed to keep building with Codex.

## Quick start

```bash
# Requires Node 20+
cp .env.example .env          # set LLM_PROVIDER and its API key (Claude or OpenAI), or AI_DISABLED=true
npm install
npm run db:setup              # creates SQLite dev DB and seeds sample opportunities
npm run dev                   # API on :8787, web on :5173
npm test                      # deterministic engine tests
```

Open http://localhost:5173, complete onboarding (turn on "sample week" to explore), then try the core journey:
**Explore → open an opportunity → Set a prep reminder → Approve → see it on Today → check off a step in Grow.**

## What's here

| Path | What it is |
|---|---|
| `AGENTS.md` | Instructions Codex reads first: conventions, guardrails, commands |
| `docs/` | PRD, UX flows, design system, architecture, data model, API, agent tools, sourcing, privacy, backlog, traceability, Codex playbook |
| `apps/api` | Fastify API, Prisma schema, deterministic domain engine, Claude agent + tools, tests |
| `apps/web` | React + Vite client: Onboarding, Today, Explore, Buddy, Grow, You |

## Status

- ✅ Final UX: top navigation, Dusk/Dark/Light appearance, warm time-of-day Today, word of the day, **News for you** (student-chosen topics, sourced stories), Buddy home with orb and saved conversations.
- ✅ Prototype scope from the PDD: Student DNA onboarding, My Day, AI Buddy with tools, Opportunity Scout (explainable, sample data), Action Agent approval → execute → verify, Growth goals, Portfolio, audit log, export/delete.
- ⚠️ Dev-only identity (`x-student-id` header). Real auth, verified parental consent and legal review (COPPA/FERPA where applicable) are required before real students use it. See `docs/09-PRIVACY-SAFETY.md`.
- ⚠️ News stories are a real, sourced starter set (Oct 2026) and do not refresh until the ingestion job in `docs/08` is built.
- ⚠️ Opportunities are **sample data** and marked unverified. Live sourcing is designed in `docs/08-OPPORTUNITY-SOURCING.md`.
