# Opportunity Scout rebuild

## Review findings and scope

The reported production request searched five interests, fetched 21 program pages and extracted 20 candidates. Verification rejected all 20 (overlapping name/organizer, numeric-grade, format and domain issues; two expired deadlines). Nothing reached catalog persistence or Pinecone. A separate extraction timeout and the shared monthly cap also occurred. Search was connected; an empty vector index did not establish that search never happened.

The reader joined block/table text (`Grades9–12`), reproduced locally. Generated quotation mismatches, mandatory organizer/format/numeric bounds and domain whitelisting discarded useful candidates. Independent verified-only filters in catalog, picks and knowledge made a verifier-only patch insufficient. Candidate identities/pages were not retained. A five-extraction run ceiling could not reliably fill six slots.

This rebuild reuses provider adapters, LangGraph/LangChain, HTTPS/DNS/robots protection, Prisma, sessions/access codes, proposals, existing quotas and scoped retrieval. It changes qualification and discovery behavior as approved. It does not merge/publish, reset student data or usage, change configured spending caps, infer age, bypass robots/bot restrictions, or guarantee six results.

## Delivery modules

1. **Preferences and contracts:** optional Student discovery preferences, Markdown research/extraction prompts, generated JSON schemas, numbered literal source passages, portable additive migrations.
2. **Research and durable work:** OpenAI Responses/Anthropic web search adapters, one format-only repair, persistent SQL state, bounded network stages, fetched-page/extraction reuse.
3. **Qualification:** evidence-driven verified/needs-checking active programs, announced openings on a separate watchlist, honest free/paid/unknown pricing, retained rejection reasons.
4. **Personal ranking:** six validated weights, private goals/projects, approximate city radius, explicit time/cost checks, feedback, verified priority and category variety.
5. **Student experience and knowledge:** same editor in You/Explore; real progress; source excerpts and warnings; Coming soon; consistent partial-program scope; shared, optional public embeddings.
6. **Diagnostics and deployment:** owner-authenticated reports, no-call fixture/config modes, small explicitly funded live test job, documented migration/publish/acceptance steps and full verification.

## Search flow

Explore does not start paid work on entry or GET. A student chooses **Search for opportunities / Search for more**. SQL catalog coverage first checks current active matching programs against the student's interests and preferences, excluding their saved/dismissed IDs. Reuse a complete library even with AI off or capped. Otherwise queue missing interests or a short cost bucket, not every interest unconditionally. Targets are up to **3 Free + 3 Paid or cost-unconfirmed total**, not per interest. A second student reuses the same public programs without repeating their ingestion.

Research contains all public interests as context, at most two focus interests per call, current date, grade band, broad region/city/state, format, missing cost groups and previously researched URLs. It does not demand every opportunity cover every interest or pack unrelated keywords into one search. Official program, eligibility and application HTML is preferred; no aggregator/card facts become evidence merely because search cited them. The model returns structured names/URLs, interest themes and cost hints. Cost hints allocate the lead pool; they never label cards Free.

At most three research calls per explicit search, a combined pool of sixteen queued leads (default eight free-hint and eight paid/unknown-hint), and one format repair across the request. Later batches share those remaining allowances. Each batch has its own existing shared reservation. Repair uses the extraction model, no web tool, and is counted. A single-interest request may use its full pool in one research call. Deduplicate canonical URL and normalized name/domain; existing fresh accepted source/fact snapshots with the same prompt/extraction identity avoid another fetch/extraction. Cache hits are re-qualified for today's dates. Unselected source candidates remain an owner audit, not automatically indexed vectors.

`DiscoveryRun.state` is durable: research → persist leads → select candidate → fetch → extract → qualify/store → next candidate → finish. Cheap transitions run together; one research, page-read or extraction stage per foreground invocation. Persist a claim before a paid call and its response before advancing. After a crash, resume a stored response; never silently repeat an unknown-outcome research/extraction call. A failed candidate does not discard successful candidates. Current Explore sends sequential work requests and separately polls actual stored progress. An owner cron can continue jobs; there is no paid fire-and-forget task after a response. Background rechecks/preparation retain their separate legacy bounded budget.

## Facts and qualification

Models select IDs from numbered source passages, not invented quote strings or evidence URLs. The server resolves exact contiguous passages from fetched pages. The model cannot set Verified, calculate dates/distances or decide student eligibility. Only supported facts enter Opportunity; raw candidate facts and full reasons remain in ResearchCandidate for owner review.

| Condition | Result |
| --- | --- |
| Real program name on a readable page; active; reviewed source; supported eligible school audience | Verified; sourceCheckedAt/verifiedAt set |
| Active program with an unfamiliar source domain, unknown grade detail or age to confirm | Needs checking; sourceReadAt set, sourceCheckedAt/verifiedAt null; explicit warnings |
| Literal “high school students,” without numeric bounds | School audience accepted; numeric grade bounds remain null |
| Literal continuous numeric grade range/list | Derive only the stated bounds, never from age or “rising” grades |
| Organizer or format missing | Keep unknown; online-only selection still requires confirmed online participation |
| College/adult-only, confirmed wrong grade/region, closed, expired, unreadable/no real identity | Exclude from active recommendations |
| Competition with no confirmed future official deadline | Exclude from active recommendations |
| Other program with future official deadline or confirmed open/rolling application statement | Active if not closed or before a future opening |
| Club/volunteering with confirmed open signup or current/upcoming activity | Active |
| Announced future opening date | Coming soon watchlist, outside the six active picks |
| Unknown availability | Retain owner audit; exclude from active picks |
| Explicit no mandatory participation fees | Free |
| Tuition-free with mandatory extras, participation fee, or unknown cost | Paid or cost-unconfirmed, with appropriate warning |
| Paid internship wages / free application / free materials | Not proof of free program participation or a participation charge |
| Source actually requires parent consent | Show that requirement; never add it merely because the student is a minor |

Reviewed sources are edu/gov and owner-reviewed DISCOVERY_TRUSTED_DOMAINS. Unknown domains do not gain a Verified badge. Source freshness is thirty days. Real calendar dates and date context must match cited text; “opens next month” is not “open now.” Expired programs never fill missing slots. Unknown age is not inferred from grade. Optional details do not become fabricated facts.

## Selection and privacy

Internal weights: interest 30, urgency 20, build/project value 15, location 15, time 10, confidence 10. A complete optional SCOUT_SCORE_WEIGHTS JSON object must total 100; invalid settings fall back safely and appear in diagnostics. Students see plain fit reasons/factors, not an objective admissions score. Source-supported project work may connect to their stated project; unknown outputs, awards and admissions advantages are never claimed.

Student preferences: city, US state, radius (default 50 miles), online/in-person/both, discovery goals, personal project, available hours/week, maximum USD cost. All optional; onboarding stays unchanged. Private goals/project/time/max-cost text is applied locally, excluded from public web context and shared catalog/vector records. No DOB, street address, school, credential or inferred age enters research. City distances use median public postal centroids (`zipcodes`, BSD), are approximate, and remain unknown for unresolved cities/venues. Online options do not use a travel radius. A confirmed minimum USD fee above the maximum excludes; incomplete totals stay flagged, not declared affordable. Time uses confirmed hours and schedule capacity; unknown commitment stays unknown.

Verified candidates rank first within the category-variety selection; use at most two of one broad type where another usable type exists, allowing a third when that is the only usable fill. Across all six, at most one eligible verified outside-interest Scout stretch, never fee-concern items. No ineligible or fabricated fillers. Legacy catalog scoring is retained for older records; Scout records use the new weights. Dismissal reasons adjust local selection; Interested/dismissal refill from SQL without a new model call. Another student's picks are unaffected. Paid stays computed but collapsed for a free-first preference.

## Storage and questions

PostgreSQL (SQLite in local development) owns opportunities, source snapshots, candidate audit, jobs, usage, feedback and student membership. Pinecone is optional retrieval infrastructure, not the program catalog. Picked/saved programs prepare public source chunks once per content/model/index generation in namespace **opportunities**; embedding/index failures leave cards in SQL. No private student text enters vectors. Partial candidates use sourceReadAt for freshness rather than forcing legacy re-extraction on every preparation. Changed Scout pages re-use Scout extraction/qualification, not the older all-or-nothing verifier.

Buddy scope is derived from current active picks plus Interested, checked on every turn; dismissals remove scope immediately. Source-review, unknown-age, cost and other warnings remain in structured answers. Unknown facts stay unconfirmed. Retrieved text is untrusted and answer claims require exact excerpts/citations. Requirements/plans remain proposals that must be approved; nothing submits a registration or modifies a calendar automatically.

## Owner diagnostics

`GET /internal/diagnostics` (Bearer JOBS_SECRET) is read-only. It reports configured provider/model names, setting presence, public catalog/source/chunk counts, current usage/caps, last five Scout runs, public query/context, raw structured research leads, names/URLs/status/reasons, workflow and recorded token/duration data. `?runId=...` adds that run's public fetched text and extracted assertions. It does not expose Secret values, student names/projects/schedules, SDK error text or internal provider response IDs. No provider/vector connection is made by this GET.

`POST /internal/diagnostics/test-scout`: configuration and fixture modes make zero provider requests and do not populate the catalog. Fixture text is clearly synthetic with dates relative to today. Live mode queues one public coding candidate under normal shared caps; returns 202/runId before provider work. Advance mode processes a bounded stage. The live test can use one research request and one extraction request (not falsely described as one total request); no format repair in this small diagnostic job. It can legitimately fail due to blocked sites/absent details. Read the run report before deciding what to change.

`npm run check:scout -- --url https://your-app.replit.app` reads this report from Shell using JOBS_SECRET in a header. Add `--mode fixture`, `--mode live`, or `--mode advance --run ID`. Repeated live clicks reuse the active diagnostic job; reads do not consume caps. Never place JOBS_SECRET in browser code, a query string or VITE_* variable. See DEPLOY-REPLIT.md.

## Upgrade and validation

Additive migration `20261105010000_opportunity_scout` is versioned for both databases. Keep profiles, applications, source records and usage. Replit development migrates with `npm run db:sync:replit`; Publish applies the production additions. Startup performs no DDL/reset, as required by this repository. Do not run db:setup against production. This update does require a schema update; republishing code alone without the schema additions will cause missing-column errors.

Tests cover source-to-six-cards integration, second-student reuse, private-context exclusion, passage IDs, provider request schemas/repair, grade/date/cost qualification, watchlist, ranking/preferences/feedback, worker crashes, limits, partial program knowledge, owner protection/no-call reads and funded diagnostic stages. Full tests and typechecks pass before each staged commit. Build copies prompt assets into dist. Final execution evidence and the live-production acceptance limit are recorded in the PR.

This workspace has no provider key or production database access and does not permit OpenAI API egress. Mocked/synthetic tests establish code paths, not real search quality. After publish, one controlled Replit live search must confirm provider behavior, reachable official sources, actual active cards, optional Pinecone records and phone usability. No guarantee that every selected interest always has three current free and paid programs.

### Local verification recorded for this PR

- Full suite: **367 tests across 51 files**; API and web typechecks passed.
- `npm run build` builds the PostgreSQL API client, copies prompt assets, and builds the web bundle.
- PostgreSQL 16: applied the eleven existing migrations to an isolated database, inserted a profile/application notes and nonzero AI/discovery counters, then applied the Scout migration. The profile, notes and counters remained intact; new JSON fields retained safe defaults.
- Built `npm start` smoke check with AI disabled: one port served HTML and its hashed JavaScript asset, production onboarding created a sign-in session, and authenticated Today/Explore/profile/applications returned 200. Owner synthetic fixture passed from the built app.
- OpenAPI YAML parsed and internal references resolved. No live external provider, production database or Pinecone request was made from this workspace.
