# 08 · Opportunity and news sourcing

The current opportunity contract is [Opportunity Scout](14-OPPORTUNITY-SCOUT.md). The owner publish/test guide is [DEPLOY-REPLIT.md](../DEPLOY-REPLIT.md). News sourcing is separate and remains unchanged.

## Catalog-first Scout

1. Explicit student search checks SQL's fresh, active, eligible current matches across interests. A complete combined 3-Free/3-Paid-or-cost-unconfirmed set reuses the catalog without paid work, even when AI is off/capped. Interested and dismissed items are excluded from new picks.
2. Missing interests or cost groups queue public research: all interests as context, at most two focus interests per batch, three funded batches per explicit request. Grade band, current date and broad city/state/region/format can enter research. Private goals/project/time/max-cost, name, school and schedule do not.
3. The model returns structured public leads with official HTML URLs, not established facts. Default queued pool is eight free-hint/eight paid-or-unknown-hint leads, sixteen total across the request. Deduplicate URL/name/domain, balance hints and keep all public lead identities/reasons for owner review. At most one JSON format repair per request; it performs no web search.
4. Fetch public HTTPS through existing public-DNS pinning, robots, redirect, decompression, timeout/size and readable-HTML protections. PDFs/media and blocked/JavaScript-only pages remain unsupported. Robots restrictions are respected. Read supporting same-origin eligibility/application pages when possible. Do not infer facts from snippets, URLs or search citations.
5. Extraction selects numbered passages; deterministic code resolves literal quotes and tests identity, eligibility, current status/dates, costs and source confidence. Generic high-school wording is sufficient for school audience, not numeric grade bounds or age. Organizer/format may remain unknown. Reviewed active sources can be Verified; unfamiliar sources/uncertain eligibility can be Needs checking with explicit warnings. Closed/expired/unknown activity does not enter active picks; an announced future opening belongs in Coming soon.
6. Free requires explicit no mandatory participation fees. Tuition-free with extras, fee-charging and unknown-price programs use Paid or cost-unconfirmed. An internship wage is not a participation fee; a free application is not a free program. Confirmed cost above a student's maximum excludes; incomplete totals stay flagged. Never create filler programs.
7. Persist qualified active/watchlist programs and source snapshots in SQL. Fresh accepted same-model/prompt snapshots avoid repeat fetch/extraction; re-qualify dates. SQL owns catalog, usage and membership. Pinecone stores optional public vectors in namespace opportunities, prepared once for picked/saved programs per source/model/index generation. Index failures do not remove cards. Reuse public programs for Student B without duplicating per-student vectors.
8. Rank privately: interest30, timing20, build15, location15, time10, confidence10; invalid custom sums fall back safely. Use city-centroid distances with uncertainty, never model distances. Prefer verified programs and category variety, at most one eligible verified outside-interest stretch without fee concerns. Feedback/refill costs no paid work; free-first keeps Paid collapsed.
9. Buddy derives current picks + Interested scope from SQL on every turn; feedback removes membership. It checks current chunk hash/model/index and exact excerpt citations. Structured facts and warnings come from SQL/rules. Private profile data is never embedded. Requirements/plans remain approval proposals; nothing submits an application.

## Durable jobs and caps

A SQL-backed LangGraph performs research/leads/candidate/fetch/extract/qualify/finish stages. Persist before/after paid work; one foreground network stage per request, up to 60 seconds (extraction's provider timeout is 30 seconds). Never replay an unknown paid outcome on crash. Candidates can fail independently; keep successful records and all reasons. Background preparation/rechecks retain separate bounded budgets. Timers, explicit student workers and owner cron share the same renewable lease. Autoscale may sleep; keep Explore open or configure an owner scheduler to advance work.

DISCOVERY_MONTHLY_BUDGET counts shared research-batch **attempts**, not dollars or full student searches. AI_MONTHLY_LIMIT counts overall accepted requests/reservations, including discovery/rechecks/preparation. AI_DAILY_LIMIT counts interactive student requests. One reservation can use several extraction/provider requests. Paid failures remain counted; a failed search preserves the student's successful manual-search slot, not the global paid attempt. Shared UTC-month resets differ from personal rolling 30-day refresh cycles. Existing usage records survive restarts/updates.

Raising caps clears historical limited UI state through a fresh current-allowance check. It does not automatically repeat a failed search or clear usage. Complete catalog reuse and deterministic features remain available. Missing vector configuration affects questions independently of live web search.

## Diagnostics and costs

Student `/api/discovery/status` is a read-only safe count/stage/failure summary bound to their own request. Owner `GET /internal/diagnostics` adds public searched names/URLs, candidate pages/assertions/reasons, configuration presence, usage and recorded provider models/tokens/durations; `runId` requests full public detail. JOBS_SECRET protects it. Neither GET starts provider work. Configuration/fixture owner test modes are free; the explicitly queued small live test uses normal caps and can make one research plus one extraction call. Never expose owner keys in browser code or query strings.

App dollar totals use a coarse internal estimate (searches × $0.03 + known/estimated tokens × $4/million for Scout). They are not current provider prices, invoices, hard dollar caps or a guarantee. Actual provider model/search/reasoning prices and token reporting differ; confirm availability/prices and billing in your provider account. Some failed attempts lack token totals; diagnostic nulls mean unknown, not zero cost. Pinecone hosting/storage costs are separate. Do not raise budgets to hide a source or extraction problem.

A real search can return fewer than six, or no active records, when program pages are blocked/expired/unconfirmed. Empty Pinecone alone is not proof search was disconnected. Read search → fetched → extracted → qualified → saved → prepared counts and the detailed reasons before changing models, indexes or student data.

## News

News uses named-source links and existing sourced-feed behavior. Models do not invent headlines, sources or article content. Student-selected topics control the brief; DEMO_MODE is an explicit labeled sample option. This Scout rebuild changes no news ingestion or calendar/plan approval behavior.
