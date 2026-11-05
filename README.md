# Pathway AI

**Make the most of today. Build a better tomorrow.**

Pathway AI is an AI companion that helps high school students (grades 9–12) get more value from their high school years. It helps them **Discover** opportunities that fit, **Simplify** everyday logistics, **Grow** skills and reflection, and **Prepare** for what comes next. It is *not* a planner; simplification is an enabling capability.

This repository contains the current pilot implementation: a TypeScript API (Fastify + Prisma with Anthropic, OpenAI or Ollama adapters), a React website, public opportunity research/knowledge workflows and all three private Growth Map drops.

**Current documentation:** [Released product specification](docs/PDD.md) · [End-to-end agentic architecture](docs/04-ARCHITECTURE.md) · [API contract](docs/openapi.yaml) · [Replit deployment](DEPLOY-REPLIT.md). The product/architecture documents identify the audited main-branch baseline and distinguish implemented features from optional setup and future capabilities.

## Quick start

```bash
# Requires Node 20+ (Node 22 LTS recommended); works on Mac, Windows and Linux
npm run setup                # creates .env if missing, installs, sets up SQLite, seeds demo data
npm run dev                   # API on :8787, web on :5173
npm test                      # deterministic engine tests
npm run typecheck
```

Open http://localhost:5173, complete onboarding (sample data requires explicit demo-mode setup), then try the core journey:
**Explore → open an opportunity → Set a prep reminder → Approve → see it on Today → check off a step in Grow.**

For **GitHub Codespaces**, choose **Code → Codespaces → Create codespace**.
The dev container runs setup automatically. Run `npm run dev`, then open
forwarded port **5173** from the Ports tab. Keep the port private.

The web app uses its own address for `/api`; Vite proxies development requests
to the API, so only port 5173 needs forwarding. Leave `VITE_API_URL=` empty in
`.env` (clear the old localhost value if upgrading). For Replit publishing,
follow [DEPLOY-REPLIT.md](DEPLOY-REPLIT.md): `npm run build` builds both apps,
and `npm start` serves the API and website on one port. Replit Publish manages
the production PostgreSQL schema.

Setup preserves existing `.env` and demo profile changes. Without an AI key,
deterministic features work automatically; configure a provider in `.env` only
if you want AI help. See [TRAINER-GUIDE.md](TRAINER-GUIDE.md) for laptop steps,
the seeded demo profile, and a training walkthrough.

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
- ✅ Private phrase sign-in, recovery codes and HttpOnly sessions restore student profiles across devices; legacy browser IDs are restricted to unlinked profiles. See deployment/privacy docs for the pilot scope.
- ⚠️ News stories are a real, sourced starter set (Oct 2026) and do not refresh until the ingestion job in `docs/08` is built.
- ✅ Shared opportunity discovery and cited program questions are implemented behind DISCOVERY_ENABLED (default false). Seed records remain unverified until checked; see [sourcing](docs/08-OPPORTUNITY-AND-NEWS-SOURCING.md).

### My applications
Explore starts with My applications: track status, student-added deadlines, private notes and checklist steps. Today highlights active deadlines within seven days. Plan my prep creates a proposal; no reminder or study block is added until approval. Works with AI disabled.

### Calendar import and your week
Add private iCal subscriptions in You → Calendars, or optionally at the end of onboarding. Sync now refreshes them; an always-on worker also syncs every three hours. Imported events are read-only. Today → Your week shows seven days with calm load labels, overlaps and tappable details. Google Calendar, Apple iCloud and Canvas help is in the app.

### Install Pathway and gentle daily nudges
Install Pathway uses the browser install prompt or iPhone Share → Add to Home Screen instructions. The offline shell contains no cached student data. You → Notifications is opt-in and off by default: choose a daytime nudge, pause for a week, test or unsubscribe. Messages come only from your actual deadlines, schedule, approvals and goals; no AI, streaks or pressure. Quiet/class times are protected, with at most one attempt per student-local day (including tests). An always-running Replit Reserved VM is required for timed jobs.


### Personal opportunity discovery and cited program questions

Explore starts with Interested (the existing application tracker), then up to three Free and three Paid picks based on interests, grade and optional state/virtual region. Unknown cost is clearly labeled; Free requires an official cost check. Free-only students can expand Paid. Interested/Not for me removes a pick and refills its bucket from the shared catalog without AI calls. One eligible stretch pick broadens interests when available.

Optional background discovery shares official-source findings across topic/grade/region groups. PostgreSQL stores public text and citations; Pinecone stores vectors in the opportunities namespace, with memory/cosine for SQLite and optional pgvector. Ask about this program opens a scoped Buddy conversation with source excerpts and check dates. Adding official requirements creates an approval proposal and preserves student notes, dates and completed steps.

Discovery is off by default and fails back to catalog mode when optional configuration is absent. Monthly means rolling 30 days: one manual refresh plus at most one interest-change bonus. Shared discovery/re-check budgets apply alongside the overall AI monthly cap; background attempts do not use student daily allowances. Follow the **Personal opportunity discovery** section of [DEPLOY-REPLIT.md](DEPLOY-REPLIT.md) for Pinecone settings, Replit Secrets, scheduling, costs and the published-site checklist. Autoscale needs a scheduled HTTP trigger for unattended opportunity jobs.


### LangGraph and LangChain workflows

Personal opportunity discovery and program-scoped Buddy run on **LangGraph.js**, with **LangChain.js** Documents, word-preserving text splitting, a program-bound retriever and prompt/LLM runnable chain. Existing provider adapters, evidence verification, budgets, Pinecone index and approval service stay in place. No additional API key or database migration is needed; hosted tracing is disabled.

Run `npm run demo:workflows` to demonstrate the real compiled graph routing with labeled offline fixtures and no paid calls. Run `npm run demo:workflows -- --mermaid` for generated diagrams. The [workflow walkthrough](docs/13-LANGGRAPH-LANGCHAIN.md) explains the code, safeguards and the boundary between graph orchestration and durable Prisma approvals.

Opportunity Scout rebuild: catalog-first bounded research, optional You/Explore preferences, source-backed Verified/Needs checking cards, Coming soon and owner-only diagnostics. Start with [DEPLOY-REPLIT.md](DEPLOY-REPLIT.md) for schema/Secrets/publish, and [the implementation guide](docs/14-OPPORTUNITY-SCOUT.md) for qualification, limits and testing. `npm run check:scout -- --url https://your-app.replit.app` reads the owner report without starting provider work (requires JOBS_SECRET in Shell).
