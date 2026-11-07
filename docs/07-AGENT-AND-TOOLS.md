# 07 · Agent & Tool Contracts

> Current execution paths, framework roles, permissions, data flows and limitations are consolidated in [End-to-end agentic architecture](04-ARCHITECTURE.md). This file retains tool contracts and implementation history; agent proposal-only writes are distinct from explicit student CRUD.
Current Explore policy: [Explore simplification](15-EXPLORE-SIMPLIFICATION.md) supersedes older active-only/eligible/source-fresh admission, separate watchlist, cost-hint quotas and six-card visibility rules below. Only a confirmed past deadline hides a result. Other details remain warnings/ranking factors. SQL stores search links before enrichment; unreadable details produce visible unconfirmed results. Source evidence, privacy, proposals, knowledge scope and AI limits remain enforced. This simplification adds no schema migration.

**General Buddy** uses the configured **Anthropic, OpenAI or Ollama** adapter (`LLM_PROVIDER`). The adapters implement the provider tool loop; `buddy.ts` supplies its round bound, prompt, history and authenticated tool executor. Max 6 tool rounds per turn. System prompt: `agent/prompts.ts`. Separate Scout and program-question workflows are described in the architecture document.

## Tools (all deterministic code)
| Tool | Input | Output | Notes |
|---|---|---|---|
| get_schedule | from, to (≤21 days) | events, conflicts, per-day capacity, rules | recurrence expanded |
| find_free_slots | from, to, minutes, count? | slots[] | inside study window; avoids commitments & downtime; ≤2/day; daily limit |
| check_plan | sessions[] | {ok[], problems[]} | must be used before proposing calendar blocks |
| search_opportunities | query? | results with factors + verified flag; excluded with reasons | only confirmed past deadlines exclude; other mismatches remain checks |
| get_learning_resources | topics[] | curated resources | only these URLs may be recommended |
| search_knowledge | query (≤1000 chars), either opportunityId or scope=my_opportunities | grouped program facts from SQL + up to five official passages with citations | server-owned picks + Interested scope; reject client ID lists; max three searches/turn |
| propose_actions | summary, rationale, actions[] | proposalId, status | **only agent mutation-request path**; zod-validated; calendar revalidated |

## Action types
`add_event` · `move_event` (non-recurring) · `remove_event` · `add_goal {ref}` · `add_milestone {goalRef}` · `save_opportunity` · `add_portfolio_entry` · `add_application_requirements {opportunityId, checklist, deadline?, referenceHash}`. Reminders = `add_event` with `eventType:"reminder"`, 15 minutes.

## Policies baked into the prompt
Use tools for facts · never claim a change happened · protect downtime and leave breathing room · unknown deadlines stay unknown · explain why it fits + one next step · integrity in learning · no admissions predictions or invented achievements · ask one clarifying question when date/ownership/intent is ambiguous · under 150 words.

## Failure handling
Tool errors return `is_error: true` with a readable message (e.g., zod issues or calendar conflicts) so the model can correct and retry. If AI is disabled or consent is off, endpoints return 503/403 and the UI shows a clear state; deterministic features keep working.

## Provider parity
Run the same golden conversations on every configured provider/model. Differences to watch: parallel tool calls, how tool errors are retried, JSON strictness, and image reading quality.

## Evals to add *(backlog)*
Golden conversations for: exam + practice overlap (must not schedule over practice), grade mismatch (must prominently flag the check under the current expiration-only policy), unknown deadline (must say confirm), homework request (must coach), "add it" without approval (must propose, not claim).

## Ollama testing

The local Ollama provider uses the same prompts, tool validation, proposal approval, and verification flow. Invalid tool-call JSON is returned to the model as an explicit error and never executes a tool. Local JSON-mode failures retry once without JSON mode and parse the response defensively. The default text model cannot read images.

## AI request caps

The HTTP boundary reserves persistent AI usage before Buddy, extraction, coach, and insight calls. Limits apply equally to every LLM provider; tool execution and proposal approval are unchanged. One feature request includes its internal tool rounds and provider retries. Quota rejection returns 429 before invoking the model. See `docs/06-API.md` and `DEPLOY-REPLIT.md`.

## GPT-5 nano response budget

Hosted `gpt-5-nano` (including dated snapshots) uses low reasoning effort and 4,096 completion tokens of additional headroom for each model call, because reasoning and visible output share the completion allowance. This is a maximum, not a fixed charge. Other models and Ollama do not receive this additional reasoning headroom. Incomplete or empty responses return a friendly 502 rather than Buddy's generic empty-answer fallback; truncated tool calls are not executed. No automatic retry is added. Server diagnostics include only model, finish reason and reasoning-token count, never student text or credentials. Live provider quality/availability still needs deployment verification.


## Student-scoped retrieval and checklist proposals

Ask about this program supplies one opportunityId. Ask about my opportunities supplies scope=my_opportunities. The server derives membership from active StudentPick + non-dismissed Interested records, excludes explicit feedback, and rechecks on every follow-up and before returning claims. A model query cannot change that set. search_knowledge is read-only, rejects arbitrary ID lists, applies a vector ID filter then SQL snapshot/model/store checks, keyword reranks ten dense matches to five passages, and groups results by program.

LangGraph retrieves → drafts JSON → verifies exact excerpts → optionally refines. At most three retrieval/draft rounds, no repeated normalized query and no automatic provider retries. Program text/history are untrusted data, never instructions. Deadline, cost, eligibility and status are rendered from database/rules; structured assertions in model excerpts are omitted. The verifier accepts only 10–600 character exact quotes from returned passages, with a 120-word quote budget. Every accepted excerpt has a source/check date. Unsupported information gets the official-page no-answer message and link; cross-program answers are grouped by program name. General Buddy’s knowledge-tool response is also rendered from server-checked results rather than unchecked model prose.

Ask remains disabled until the selected source generation is ingested. The UI distinguishes actual preparation, shared allowance, missing readable source and owner-retry states. SQL text/chunks are shared once per public program; store/model/hash changes invalidate freshness. Existing saved text can be embedded without refetching or changing its check date. Unfunded limited markers recover with fresh allowance; failed/unknown paid work requires explicit bounded owner retry. No student names, IDs, profiles or chat content enter Pinecone. Owner diagnostics and preparation are authenticated server operations, not new agent tools; see [recovery](21-EXPLORE-RECOVERY.md).

Checklist buttons build source-backed proposals carrying titles/URLs, cited deadline and evidence hash. Scope is checked on creation; transactional execution requires the student’s Interested record and unchanged evidence, merges steps/citations, preserves completed work, notes and student dates, and reports VERIFIED/FAILED. Nothing registers or submits an application. Shared search/recheck/preparation attempts reserve the overall monthly AI allowance; interactive questions also use the student’s daily allowance.

## Framework orchestration and local workflow records

Discovery uses `discovery/graph.ts`; program questions use `knowledge/question-graph.ts`. `knowledge/retriever.ts` is a LangChain BaseRetriever, `knowledge/documents.ts` uses LangChain Documents/textsplitters, and `knowledge/answer-chain.ts` composes PromptTemplate with the unchanged provider-neutral JSON interface. General Buddy still uses the existing typed provider tool loop.

Program-message metadata includes `workflow: {engine: "langgraph", steps: [{node,status,reason?}]}`. Shared discovery stores equivalent steps in DiscoveryRun.usage.workflow. These contain controlled stage/status/reason labels, no prompts or raw passages. Hosted LangSmith tracing is explicitly disabled; this does not introduce an external tracing integration. Graph errors do not trigger automatic paid retries. Student proposals/approval/verification remain in the existing Prisma service and are tested unchanged.


## Opportunity extraction output contract

The optional provider-neutral JSONSchema argument to LLM.json enables strict schema output in the hosted OpenAI adapter for opportunity extraction. Other JSON callers retain their existing format. Null evidence is removed locally and never establishes a fact; Zod and deterministic official-source checks still decide whether a program can be verified. Compact quotes and a bounded 4096-token text budget apply to extraction, plus nano's existing reasoning headroom. No automatic hosted retry or loose-JSON fallback is introduced.

Typed output failures distinguish missing model, malformed JSON, incomplete output and refusal; local schema failures retain only safe field paths/codes. SDK timeouts and connection failures are identified independently of generic Error.name. Keys, provider messages, prompts and rejected values are excluded. New run records include requested provider/model identities; historical models remain unknown. The owner check command uses one synthetic request and local verification without database/vector access.

## Versioned Opportunity Scout

Research and extraction use Markdown assets copied to the API build and Zod-generated closed schemas. Research may call a web tool; extraction selects numbered literal source passage IDs and cannot set facts/verification/ranking. All vendor SDK imports remain in agent/llm. Private goals/projects/time/max cost never enter shared web research or embeddings. One JSON format repair is allowed per search, without another web tool; provider retries remain disabled. Scout qualification is source-based, accepts supported high-school audiences, permits explicitly labeled partial active candidates and separates future openings. The search tool/Buddy retain warnings and exact citations. Proposals/approval remain mandatory for plan changes. See [Scout design](14-OPPORTUNITY-SCOUT.md).

## Research evidence first

Scout research may use a bounded multi-search tool and return optional program reports plus short source quotations. These are untrusted assertions. Deterministic matching against actually fetched source text establishes facts; provider quotations alone never gain Verified/Free or create synthetic source pages. Default research_evidence mode and its Scout rechecks make no extraction AI request. Optional fetch_and_extract uses roughly 12,000 relevant characters and preserves original citation IDs. The existing one format repair/request remains tool-free. All vendor SDKs stay in agent/llm. Missing years are never inferred; only confirmed expiration hides a result.

Estimated discovery funds are reserved with shared request counters before paid work; concurrent runs cannot claim the same estimated balance. A failed/empty search preserves the student slot, with explicit retry cooldown/daily limits. Provider attempts and unknown outcomes remain counted. Estimates are not invoices or a hard provider-wide billing cap. See [current sourcing](08-OPPORTUNITY-AND-NEWS-SOURCING.md).

## Growth Map Drop 1 boundary

No new agent tool or AI call is added. Skill suggestions are deterministic catalog matches; confirmation, focus, hiding/correction and requests are explicit student UI actions, ownership-validated and audited. Future Make this a goal must reuse the existing propose → approve → revalidate → execute → verify flow. Private Growth Map records are never sent to the shared program vector index.


## Growth Map Drop 2

Growth insights use the provider-neutral JSON interface for bounded factual phrasing/selection only. Every displayed formulation, cited ID and action is validated against deterministic candidates. No new data-writing agent tool is introduced. Goal actions call the existing proposal service; no goals, bookings, applications or messages are executed by insight generation. Hidden/dismissed data and raw reflections never enter prompts.


## Growth Map Drop 3

The monthly provider receives aggregate counts, visible grown skills, a deterministic idea and permitted factual stories/opaque citations, not identity/raw activity titles/full reflections. Only an exact grounded formulation under 120 words can be shown. AI generation cannot save portfolio entries or goals: Save is a separate explicit student action; Plan it uses the existing proposal/approval service. Saved summaries cannot be retagged into new achievements.

## Drop A: Explore and program-answer evals

`npm run eval:explore` runs the real Scout/catalog/retrieval/answer paths against synthetic profiles and saved HTML, with replayed providers and local test vectors. It reports discovery, source handling, saves, indexing, relevance, citation/scope correctness and usage separately. The [eval guide](20-EXPLORE-EVALS.md) covers the explicit budgeted live canary, scorecards and model/prompt comparisons. This adds no student tool, MCP server or automatic paid job; Buddy-planning and Growth-quality evals remain later drops.
