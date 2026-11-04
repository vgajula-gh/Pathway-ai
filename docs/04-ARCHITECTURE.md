# 04 · Architecture

Current Explore policy: [Explore simplification](15-EXPLORE-SIMPLIFICATION.md) supersedes older active-only/eligible/source-fresh admission, separate watchlist, cost-hint quotas and six-card visibility rules below. Only a confirmed past deadline hides a result. Other details remain warnings/ranking factors. SQL stores search links before enrichment; unreadable details produce visible unconfirmed results. Source evidence, privacy, proposals, knowledge scope and AI limits remain enforced. This simplification adds no schema migration.

## Overview
```mermaid
flowchart LR
  subgraph Client [Web app · React + Vite]
    UI[Today · Explore · Buddy · Grow · You]
  end
  subgraph API [API · Fastify + TypeScript]
    R[Routes + zod validation]
    D[Domain engine<br/>schedule · scoring · metrics · actions]
    P[Proposal service<br/>revalidate · execute · verify · audit]
    AG[Buddy agent<br/>tool-use loop]
    T[Tools<br/>get_schedule · find_free_slots · check_plan<br/>search_opportunities · get_learning_resources · propose_actions]
  end
  DB[(SQLite dev / Postgres prod<br/>Prisma)]
  C[Claude API]
  UI -->|REST JSON| R
  R --> D
  R --> P
  R --> AG
  AG <-->|messages + tool_use| C
  AG --> T --> D
  T --> P
  D --> DB
  P --> DB
```

## Decision flow (from the PDD)
Student context → understand request → retrieve reliable context → evaluate relevance, eligibility, capacity → recommend with explanation → request approval when action is needed → execute through an authorized tool → verify → learn from explicit feedback.

## Today time estimates

`domain/remaining-time.ts` computes display-only future time from student-local `wallNow`, availability and calendar occurrences. It clips windows/events to the remaining calendar day, merges overlapping bookings, excludes protected rest from study free time, and reports remaining unbooked rest and booked rest separately. Weekly recurrences and overnight windows are included. `todayMetrics` retains full-day Study planned and weekly goal progress; the planner's full-day `dayCapacity`, free-slot search and proposal validation retain their existing semantics. GET Today is uncached and read-only; the visible client refreshes each minute and on return/focus. Insight uses the same student-local day. No schema, environment setting or paid provider call is added by these estimates.

The Today Timeline toggles inline to a vertical weekly agenda. `GET /api/week?weekOffset=N` derives Monday in the student's timezone using domain time helpers; the existing rolling `from` and omitted-query behavior stay compatible. `domain/today.timelineItems` serializes the same event flags for both API views. The shared client `TimelineEvents` component handles supported completion through the existing authenticated PATCH route; no new agent writing tool or provider call is introduced. Week requests ignore obsolete responses after navigation/unmount. Today refreshes re-read the visible week, preserving a valid selected creation date. Rings retain daily meaning regardless of the selected view.

## Read-only sparks and explicit publisher refresh

`domain/words.ts` selects the daily/practice word deterministically in student-local calendar time. `GET /api/words` has no writes or provider calls. Timeline deletion reuses the existing authenticated, audited DELETE endpoint after UI confirmation. News GET stays read-only; only explicit `POST /api/news/refresh` ingests public RSS/Atom metadata. Fixed feeds in `data/news-feeds.ts` receive no student data. The fetcher pins public DNS, validates same-publisher HTTPS redirects and enforces 10 seconds / 1 MiB. Parsing rejects entities/HTML payloads, unsupported URLs/dates and articles older than 30 days; stores at most 30 entries/feed with source text and stable URL hashes. Existing JobLease rows provide atomic shared cache claims (15 minutes; one-minute failure backoff) across instances. NewsStory stores real entries with isSample=false; demo-only seed entries are hidden in production. Existing real stories survive failure. No schema/Secret/provider SDK is added.

## LLM layer (provider-agnostic)
```
Buddy agent · insights · schedule scan · coach
                │  LLM interface: runTools() · json() · text()
        ┌───────┴────────┐
  Anthropic adapter   OpenAI adapter + Ollama wrapper        ← selected by LLM_PROVIDER
  (Messages + tools)  (Chat Completions + function calling)
```
Tool definitions are written once (JSON Schema) and translated by each adapter. Guardrails do not depend on the model: tools validate input, the engine decides facts, and only the approval service writes data.

## LangGraph and LangChain workflows

Opportunity discovery and program-scoped Buddy now use **LangGraph.js** for explicit state transitions and conditional routing. **LangChain.js core/textsplitters** supply Documents, word-preserving text splitting, a scoped BaseRetriever and the prompt-to-LLM runnable chain. The framework work executes in production paths; these are not unused dependencies. The general Buddy/schedule/coach provider adapters still implement the existing provider-neutral LLM interface.

Discovery graph: search → select candidate → fetch official pages → extract → deterministic verification → shared catalog transaction → knowledge ingestion → next candidate. Failed candidates follow a skip branch. Search failures propagate to the existing job failure handler; paid nodes have no graph retry policy. The same RunBudget limits and public-only queries remain authoritative.

Program-question graph: retrieve → draft JSON → verify quotes → finish or refine query → retrieve. It stops after three retrievals/model drafts, repeated normalized queries, or an empty initial result. The program scope is bound by the server's LangChain retriever. Models can suggest a different search phrase, never another program ID or a data-writing operation.

LangChain's CharacterTextSplitter uses word counting and retained separators to preserve the prior 500-word/50-word overlap, normalized text and chunk IDs. PromptTemplate produces a PromptValue, which the bridge converts to text before calling the existing LLM.json adapter. Pinecone, memory and pgvector adapters remain interchangeable; SQL rechecks scope, model identity and snapshot hashes after vector retrieval.

Framework calls run in an explicit tracing-disabled context. No LangSmith account/key is required, and student prompts/passages are not exported to hosted tracing even if ordinary tracing environment flags are present. Local workflow records contain fixed node names, completion/failure status and controlled reason codes, not input/output snapshots. DiscoveryRun.usage and program-message metadata retain those small records.

**Durability boundary:** Prisma still owns leases, usage reservations, job states, conversations and approval records. These graphs do not add checkpoints, replay paid nodes after a crash, or use LangGraph interrupts to approve changes. The existing proposal service remains the sole student-plan write authority after explicit approval. The original framework refactor reused existing tables; the student-scoped rebuild below adds two portable migrations.

Run `npm run demo:workflows` for an offline demonstration with labeled synthetic fixtures and no provider/database calls. `npm run demo:workflows -- --mermaid` prints diagrams generated from the actual compiled graphs. See [workflow walkthrough](13-LANGGRAPH-LANGCHAIN.md) for the code map and demonstration steps.

## Key decisions
| Decision | Choice | Why | Trade-off |
|---|---|---|---|
| LLM vendor | **Claude, OpenAI or local Ollama** via adapters | No lock-in; pick per cost, quality and school requirements | Small differences in tool-calling behaviour; covered by evals |
| Agent topology | **One orchestrating agent** with typed tools | Coherent companion, simpler safety review | Less parallelism than multi-agent |
| Truth source | **Deterministic domain code** for dates, conflicts, eligibility, approvals | Correctness; testable | More code than "let the model do it" |
| Writes | **Proposals only**; execution after approval in a DB transaction with verification | Consent, auditability, idempotency | Extra tap for students |
| Stack | TypeScript end to end (Fastify, Prisma, React/Vite) | One language; Codex-friendly | Not a native mobile app (yet) |
| DB | SQLite for dev, Postgres for prod (same Prisma schema, JSON as strings) | Zero-setup local dev | JSON not queryable in SQL; migrate to `Json` on Postgres later |
| AI calls | Claude Messages API with tool use; JSON-only prompts for briefs/extraction | Structured outputs; images for schedules | Latency 2–20s; UI shows progress |

## Request lifecycle: approval
1. `POST /api/proposals/:id/approve` → status `APPROVED` (audit).
2. Duplicate check by idempotency key → `FAILED` if already applied.
3. `EXECUTING` → **revalidate** the calendar now (it may have changed) → `FAILED` with reason, nothing applied.
4. Prisma `$transaction`: apply all actions, then read back each change (verification). Any error rolls back.
5. `VERIFIED` with result + created ids, or `FAILED` with rollback note. Both audited.
6. Proposals expire after 48h (`EXPIRED`).

## Replit pilot deployment

The current pilot uses one Fastify server to serve the compiled React app and `/api` on `PORT`, binding `0.0.0.0`. Production generates a PostgreSQL Prisma client; Replit applies its schema diff during Publish, SQLite remains the local/Codespaces default. Access codes gate new visitors and are bound to each student at onboarding. Private phrases with single-use recovery codes and hashed HttpOnly cookie sessions restore the same profile on other devices; unlinked legacy profiles can be upgraded in You. Persistent daily student and shared monthly AI quotas are enforced before provider calls. See `DEPLOY-REPLIT.md` for publishing and `docs/06-API.md` for the API contract.

## Longer-term production path *(proposed)*
- **Auth:** Clerk / Auth.js / Supabase Auth; age gate; verified parental consent flows where required.
- **Hosting:** API on Fly.io / Render / Railway; web on Vercel / Netlify; managed Postgres (Neon / Supabase / RDS).
- **Storage:** object storage for attachments (S3/R2) with signed URLs; don't persist schedule photos after extraction unless the student opts in.
- **Jobs:** a queue (BullMQ / Cloud Tasks) for opportunity sourcing, source re-checks and proposal expiry.
- **Observability:** structured logs with PII redaction, error tracking, an eval suite for agent behavior (see backlog).
- **Mobile:** wrap with Capacitor or rebuild in React Native/Expo reusing the API.

## Local AI testing

`LLM_PROVIDER=ollama` reuses the OpenAI-compatible adapter at `OLLAMA_BASE_URL` (default `http://localhost:11434/v1`) with `OLLAMA_MODEL` (default `llama3.2:3b`). No auth header or API key is sent. Local calls allow fifteen minutes with automatic retries disabled; the development proxy and API connection allow twenty minutes in total for a multi-round tool conversation. Invalid tool arguments produce a tool error without execution. JSON-mode rejection or unreadable output gets one plain-text retry with defensive JSON parsing. Student consent and the approval/verification flow apply to every provider. Codespaces provisioning is optional through `USE_OLLAMA` (default on); the service binds to loopback.

## Personal opportunity discovery and RAG

```mermaid
flowchart LR
  E[Explicit Search / Search again] --> Q[SQL request + shared public interest group]
  Q --> C{Enough recent active catalog items?}
  C -->|yes| P[Deterministic StudentPick selection]
  C -->|no| G[Leased LangGraph: search / fetch / extract / verify]
  G --> S[(SQL catalog + official snapshots)]
  S --> P
  P --> K[Shared public program preparation]
  K --> D[(SQL KnowledgeChunk text + citations)]
  K --> V[Pinecone namespace opportunities]
  B[Scoped Buddy] --> A[SQL owns picks + Interested scope]
  A --> R[LangChain retriever: vector filter + SQL checks + keyword rerank]
  R --> V
  R --> D
  R --> F[SQL structured facts + verified excerpt citations]
```

Production sample seeding is off unless DEMO_MODE=true. Active-only rules live in domain/opportunity-active.ts, eligibility in scoring.ts and cost/ranking in picks.ts. SQLite remains the local default, with memory/cosine vectors. Explicit VECTOR_STORE=pinecone uses the official SDK; pgvector is optional. The default store is memory in every environment; set pinecone explicitly for durable production vectors.

OpportunitySearchRequest durably tracks a student search without embedding private data. Group bindings point to public topic/grade-band/region work; an optional cached flag records a queued group that no longer needs paid work. Base/bonus manual slots are reserved, then charged once only after complete/empty settlement. Failed, interrupted, limited or cancelled requests are not charged. Global paid attempt reservations remain counted on failure. Both first search and Search again are explicit and catalog-first. A complete recent active catalog covers each selected interest and the combined three Free/three Paid target without paid work or manual debit, even with AI off or quotas reached. Only absent interests are queued; if all interests are covered but a bucket is short, queue the least-covered topics for that bucket. The worker rechecks gaps before reserving funds, since another student may have filled them. Monthly refresh applies only to students with a completed prior search. Later interest edits expose the explicit bonus action. Current shared usage is read independently of historical limited request status, so raising a cap recovers the control without erasing counters.

Timers, authenticated request-bound work and owner cron share a renewable database lease. Each invocation processes at most one group, one public-program preparation and one source recheck. Request-bound work uses only the signed-in student’s persisted group bindings and current program membership. PostgreSQL serializable write-conflict retries include bounded backoff; these retry database transactions, never paid graph nodes. Autoscale may sleep; use cron for unattended progress.

Store once, link per student: SourcePage and KnowledgeChunk are shared by program. Ingestion skips a matching source hash + embedding provider/model/dimension + vector store/index identity. Switching index therefore re-ingests, even with the same text/model. A per-program lease prevents duplicate simultaneous embedding. SQL remains authoritative after retrieval: reject wrong program IDs, obsolete snapshot hashes, wrong model/store identity and non-opportunity scope. Pinecone metadata contains only chunkId, opportunityId, sourceUrl, pageTitle, checkedAt.

Knowledge preparation runs under the shared monthly AI and recheck/preparation allowance. A public generation/month marker prevents a failed or interrupted paid preparation from replaying on every page load. Subsequent source/model/index generations or the next month can be attempted; no provider retry policy is added. Missing keys or a dimension/metric mismatch disables questions with a safe explanation while search can still produce verified catalog results. Catalog persistence survives optional indexing failures.

Retrieval scope is computed from SQL on each request/turn: current eligible active StudentPicks plus non-dismissed Interested applications, excluding explicit feedback. A caller can select one member or my_opportunities, never supply an allowed-ID list. The vector query filters the set (IN for multiple programs), requests top ten, then SQL validation and keyword reranking return five passages. The read-only LangGraph may refine at most twice more. SQL/rules render deadline, cost, eligibility and status; structured assertions are removed from model quotes. Text claims must be exact excerpts in retrieved passages. Cross-program replies are grouped and cited, with an official link when unsupported. General Buddy also renders server-verified knowledge-tool results rather than unchecked model prose.

Expired picks leave scope immediately; Interested progress remains accessible. Monthly reconciliation removes expired chunks only when no saved application, pick, goal or pending proposal references the program, then removes orphan vectors. Public page snapshots remain available for later source checks. Switching to a different index does not delete the old index; retiring it is an owner operation.

Two additional portable migrations add active/application fields + OpportunitySearchRequest, then KnowledgeChunk.vectorStoreKey. Apply to development PostgreSQL and let Replit Publish apply the production diff; never add DDL to npm start. See [deployment guide](../DEPLOY-REPLIT.md).

Foreground work handles a search group or a standalone program preparation per call, keeping slow providers within the web request window. Timer/cron work shares a three-minute run deadline, checked before funding another stage; a final in-flight provider call can finish after that deadline. Paid nodes are never automatically replayed.

OpenAI extraction passes a provider-neutral JSONSchema option through LLM.json to strict structured output in the adapter. Its evidence object has fixed nullable properties; local Zod parsing removes null evidence and the deterministic verifier still requires literal official-page support. The bounded response allowance is 4096 text tokens plus nano's existing reasoning headroom. Other JSON callers and local/Anthropic behavior remain compatible. DiscoveryRun.usage.models captures requested model identities; typed, redacted output errors preserve the failing stage without provider text. All-operational-failure runs are failed, while evidence-only empty results remain complete/empty. The standalone owner extraction check uses a synthetic fixture and no database/vector services.

Source discovery prefers direct current/upcoming HTML pages, filters known downloads before the ten-candidate cap and alternates the Free/Paid URL lists. Eligibility/fee links are collected before navigation is removed from source text. Generic MIME responses require an HTML signature; binary markers, robots/DNS/redirect checks and decompression bounds remain enforced. Usage JSON adds candidate counts and saved IDs are recorded when the catalog write succeeds, before optional indexing. The existing signed-in status endpoint derives a controlled summary from that request's bound runs, including old history, without provider calls or raw source/provider data. Primary errors prioritize actionable configuration and later processing failures over an early unsupported file.

The versioned Scout path uses `scout/runner.ts` (LangGraph) with SQL checkpoints: research → leads → candidate → fetch → extract → qualify/store → finish. One network/model stage per foreground call; cheap transitions run together. Paid stages persist in-flight claims and do not replay uncertain outcomes after crashes. `scout/scheduler.ts` coalesces up to two public focus interests, bounded to three funded batches and a sixteen-lead request pool. `domain/scout-qualification.ts` checks literal passage evidence; `domain/scout-scoring.ts` applies private preferences and deterministic weights. Legacy extraction/recheck compatibility remains for older catalog rows.

Reviewed active programs may be Verified; active source-backed partial candidates remain Needs checking with `sourceReadAt` and null `sourceCheckedAt`. Catalog, picks, Buddy scope and knowledge preparation apply the same distinction. Unknown numeric grades are not inferred from a cited high-school audience. Unannounced/expired/closed programs do not fill active slots. ResearchCandidate retains public leads, pages/assertions and all qualification reasons for protected owner diagnostics. New migrations are additive; see [Scout design](14-OPPORTUNITY-SCOUT.md).

## Evidence-first Scout update

Default graph: research (up to five web tools) → persist all safe leads/reports → one fetched-page confirmation → deterministic facts/qualification → next candidate. No extraction AI node runs in research_evidence mode; unknown/blocked results remain visible. Optional fetch_and_extract retains its extraction node, with relevant-passages input and a 90-second cap. Persist the mode per job so existing in-flight jobs keep their original contract. Two batches can coalesce three focus groups each, covering five interests. Paid call claims, shared worker leases and no uncertain replay remain authoritative.

Estimated-dollar reservations use anonymous month keys in existing AIUsage and reservation metadata in DiscoveryRun.usage. Serializable reservations protect concurrent admission; terminal compare-and-set settlement releases unused estimated funds once. No schema migration is added. Request counts, observed web-tool calls, token estimates and dollar estimates are distinct. Empty/failed searches preserve manual slots; explicit retries have a one-hour/shared daily bound. See [sourcing](08-OPPORTUNITY-AND-NEWS-SOURCING.md).

## Growth Map Drop 1

`domain/growth-map.ts` and `growth-map/catalog.ts`, `sources.ts`, `service.ts` keep tagging and all counts/dates/stages deterministic. Confirmations are student-scoped, atomic and idempotent; live sources revalidate stored associations on reads. The separate `GrowthMap` page opens from You without replacing Grow. Seven additive tables support catalog, private evidence/decisions/focus/review/requests; existing session scalars remain unchanged. Read failures from pending Growth Map migrations are contained, and export tolerates unavailable new tables. No provider or Pinecone request is added. See [contract](16-GROWTH-MAP.md).


## Growth Map Drop 2

`domain/growth-insights.ts` owns signals, candidate qualification, exact-language/evidence validation and skill/stage matching. `growth-map/insights.ts` owns private cache, token leases, budget reservation, dismissal and ordinary proposal creation; vendor SDKs remain in `agent/llm`. GET is read-only; POST automatic/manual requests are atomically claimed. Two isolated tables avoid core Student scalar dependencies. A zero-row owner/CLI readiness probe checks all Growth Map columns without schema writes. See [Drop 2](17-GROWTH-INSIGHTS.md).
