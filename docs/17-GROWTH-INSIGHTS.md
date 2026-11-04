# Growth Map Drop 2 — insights and next steps

Implements GM-15–19 on top of Drop 1. Monthly letters and six-month charts remain Drop 3. Growth Map stays separate from Grow and private by default.

## Student experience

Open You → Growth Map. With at least three distinct confirmed activities, the insights area can show up to three different types: Growing fastest, a recurring reflection theme, a connection, and Your next rung. Every card has tappable **Based on** sources and **Not me**. Source links open the student's actual activity. Next-rung cards can suggest a goal; See evidence opens skill detail. The map also has an explicit next-rung entry independent of AI availability, favoring the monthly focus.

Skill detail shows the deterministic next stage, a small experience idea, and up to two matching programs from the shared catalog/own picks. **View in Explore** opens that specific program's existing detail screen. Reading matches never searches the web or writes Pinecone. Unknown eligibility, cost, location and deadline remain checks for the student; a source-checked past deadline excludes a program. Sample/seed programs outside demo mode and this student's dismissed programs are excluded. Matching requires both a catalog skill/name/synonym and explicit program kind for that stage. Generic programs without a supported stage are not claimed as a match. Own picks/bookmarks rank ahead of other catalog matches, then source-checked programs. Empty matches say so without inventing replacements.

**Make this a goal** creates an AWAITING_APPROVAL proposal containing one goal and one small step. It never schedules time or submits an application. The existing Review screen exposes actions/data/consequences and requires approval; proposal execution revalidates and returns VERIFIED/FAILED. Declining changes no goals. Repeated identical proposals reuse the existing idempotency rules. Interest-only skills cannot generate a next-stage goal.

## Facts and AI boundaries

`domain/growth-insights.ts` derives qualification, reflection keyword signals, co-occurrence, stable dismissal signatures, ranking and matching. Growing fastest uses Drop 1's growing rule and greatest positive current-month difference. A reflection theme needs a catalog name/synonym in at least three distinct confirmed activity groups for that skill. Full reflections stay on the server and are treated as data. A connection needs confirmed skills on the same activity (or an explicit capture/milestone link); different study blocks do not become a connection just because they share a weekly group. Interests alone never create evidence. Next stage follows the highest supported stage; earlier stages are never fabricated.

The provider receives only a compact summary of visible confirmed skills, counts, trends, focus, next stages, public program matches, evidence IDs and up to twelve permitted insight options. No student name, location/school, raw activity titles, full reflections, hidden skills or dismissed insight options are sent. Public opportunity names are permitted. No hosted tracing or vector storage is added.

AI selects/reorders up to three different insight types and chooses a supplied factual formulation under 35 words. Language is deliberately bounded: the server accepts only one of the approved formulations for the selected option, exact own evidence IDs and its allowed action. Arbitrary model prose is rejected even if its numbers look plausible. This gives up open-ended commentary to enforce the requirement against invented achievements, rankings, ability scores, personality/health claims and admissions predictions. Unsupported cards are dropped; an entirely invalid response keeps the prior valid cache. This is selection and bounded phrasing, not an unrestricted writing agent.

Each option's stable signature includes type, skill IDs and (for next rung) the target stage. Count/date changes do not revive a dismissed idea. Repeated dismissals of a type lower that type's priority; no more than three options of one type enter the prompt. Focus is prioritized. Up to six representative evidence groups and six source links keep cards/prompts compact; aggregate counts are calculated over all qualified evidence. Full evidence remains in skill detail.

Cached cards are revalidated against current candidates, evidence/source fingerprints, visibility, dismissals and consent on every read. Source changes can remove a stale card before the next AI refresh. An in-flight response is revalidated before storage. With student AI consent off, no AI cards are displayed or generated. With server AI disabled or an exhausted allowance, currently valid cached cards remain dated; deterministic map/next steps still work.

## Refresh, budgets and concurrency

GET insights is read-only and never calls a provider. It returns whether an automatic refresh is due. On opening the map, the client explicitly POSTs automatic refresh when due, at most once per component opening. Weekly refresh is an on-visit refresh after seven elapsed days, not a background email/job. The owner does not need a new cron task.

A student may additionally request one manual refresh per local calendar day. Persisted state and serializable claims prevent concurrent tabs/instances from spending twice. A 90-second token lease protects generation; provider timeout is 25 seconds with paid-provider SDK retries disabled. Ollama retains its existing local JSON-compatibility fallback; internal rounds remain one accepted request under the existing quota policy. A provider attempt (including failure/invalid output) consumes its automatic weekly or manual daily slot and the existing AI reservation. Interrupted attempts do not replay automatically. Pre-provider quota rejection preserves those refresh slots, with a one-minute cooldown. The client rechecks after a short quota cooldown so a raised cap can be retried without a stale disabled button. An expired abandoned lease reports failed rather than spinning indefinitely. Existing AI_DAILY_LIMIT and AI_MONTHLY_LIMIT enforce site policy; reservation accounting retains UTC windows. All accepted requests use reserveAI; no unmetered model call or retry is added.

The lower-cost OpenAI default is gpt-4.1-mini. Optional AI_MODEL_INSIGHTS overrides the task model on the selected LLM_PROVIDER. Anthropic/Ollama use their configured model unless overridden. Existing credentials and AI_DISABLED apply. No mandatory new Secret is introduced. Invalid provider configuration/error is contained in the insight area, retaining valid cache and fixed friendly status; prompts and provider error bodies are not logged.

## API and data

All student endpoints require existing authentication and return no-store:

- GET /api/growth-map/insights — dated revalidated cache, status/message, automaticDue/canRefresh.
- POST /api/growth-map/insights/refresh — strict `{mode: "automatic" | "manual"}`; returns current cache/status, including disabled/empty/limited/failed/invalid/refreshing/ready. Does not turn a cap into a whole-map error.
- POST /api/growth-map/insights/:id/dismiss — owned cached insight signature; idempotent Not me.
- GET /api/growth-map/skills/:id/next — visible skill, deterministic stage/idea, up to two program matches; no provider call.
- POST /api/growth-map/skills/:id/goal — optional `{insightId}` revalidates the owned current goal card; returns an ordinary proposal, not a new goal. Without insightId, deterministic next-step proposals remain available with AI off.

GrowthInsightState stores one student's cache, refresh slots, lease and controlled status. GrowthInsightDismissal stores stable private signatures and type feedback. Both cascade with Student and export under `growthInsights`; Drop 1 continues exporting under `growthMap` if only Drop 2 setup is pending. Mutations are audited. No new agent writing tool is added.

## Release check and Replit rollout

Migration **20261107010000_growth_insights** adds **two tables only**, in both SQLite and PostgreSQL histories. It does not add Student scalar fields or alter existing records. Startup performs no new schema writes. Missing Drop 2 setup is contained in insights; Drop 1 map/next steps/session/Today keep working.

1. Sync the merged main branch. Apply development PostgreSQL migrations with `npm run db:sync:replit`.
2. Run `npm run build` (generates the PostgreSQL client), then **npm run check:growth** against the development DATABASE_URL. This read-only command probes every scalar column of all nine Growth Map tables using zero-row SELECTs, returns readiness per table, and exits nonzero if unavailable. It never creates, deletes or resets data. SQLite users should use a SQLite-generated Prisma client when checking their local database.
3. Run tests/typecheck and test a disposable student's Drop 1 and Drop 2 flow. Publish and review/apply both new production tables. **Preserve existing records; do not overwrite/reset production.** A development check cannot establish production readiness.
4. After Publish, use the owner-protected GET **/internal/growth-map/readiness** with existing JOBS_SECRET in the Authorization Bearer header from owner tooling. It checks the running app's database and returns 200 if ready, 503 otherwise, with per-table checks and no student records/credentials. Do not put JOBS_SECRET in a browser URL or student frontend. Alternatively run the read-only CLI in owner tooling configured for production. No production migration command is run by this check.
5. Sign in to the published app and verify Today, Explore, You, Growth Map, confirmed evidence and next-step matches. With AI consent on and three activities, verify a dated insight set, open Based on, dismiss one, and refresh. Approve/decline a disposable goal proposal and verify the real result. With AI off/capped or provider failure, verify map and next steps still load and valid cached cards remain.
6. Test a second profile's isolation, source deletion/hiding, export and account deletion. Verify phone keyboard/touch access, all themes and reduced motion. The release is not verified solely by /api/health or a successful build.

These checks catch missing feature setup; they do not automatically promote a Replit deployment, mutate production schemas, or replace signed-in smoke testing. The broader release-preparation workflow discussed separately is not silently bundled into this feature.


## Implementation validation

- 524 tests across 62 files, type checking and the production build pass.
- A disposable PostgreSQL upgrade from Drop 1 preserves its student, three captures and six confirmed tags. The readiness command correctly reports only Drop 2 missing before migration and all nine tables ready afterward.
- Chromium against the production-mode API/PostgreSQL verifies 320/390/1024px layouts across all three themes, 44px insight controls, source links, exact program opening in Explore, goal approval to VERIFIED, dismissal/manual refresh and student isolation without page errors.
- API checks exercise provider failure, exhausted quota, consent off and existing core routes. Recovery checks cover a raised cap after cooldown and an abandoned refresh lease.
- Provider behavior is tested with mocks and a local HTTP fixture through the real Ollama/OpenAI-compatible adapter. This establishes the workflow/contracts, not availability or quality of a live paid model. No paid provider calls or production/student records were used.


With Drop 3 installed, readiness additionally checks GrowthLetter (ten tables total) and reports drop3Ready. See [monthly letters and history](18-GROWTH-LETTERS.md); the nine-table counts above describe Drop 2 validation.
