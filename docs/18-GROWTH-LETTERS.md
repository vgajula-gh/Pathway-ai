# Growth Map Drop 3 — monthly letters and activity history

Implements GM-20–23: a private monthly growth letter with recorded counts and one optional next idea, quiet-month notes, private portfolio reflection copies, month archives, and six-month skill activity charts. Earlier map, tagging and insights stay separate and usable.

## What students see

You → Growth Map has a monthly letter card for the previous **student-local completed month**. Read your growth letter opens a story under 120 words, counts, skills with growing recorded activity, source links and one next-month idea. With fewer than three distinct confirmed activity groups, it shows **A quieter month. Here’s one idea to get going.** without calling AI. A multi-skill project is one activity, not one per tag. Interest-only tags do not qualify a month.

**Plan it** opens the existing proposal Review flow for one goal and one small step. Nothing is created until approval. It never books calendar time, submits an application or shares a letter. The idea is calculated from a skill with evidence in the reported month, favoring the focus recorded for the following month. No skill is claimed as mastered; earlier ladder stages are never invented. A quiet month can suggest capturing one experience without fabricating an achievement.

**Save to portfolio** explicitly creates and verifies a private `growth_letter` reflection. Concurrent/repeated saves produce one copy. In Grow → Portfolio the student can open the saved reflection or confirm deletion of just that copy. The monthly archive remains; another explicit save can create a new copy after deletion. Later edits/hiding/source deletion do not silently rewrite a saved portfolio snapshot. The live letter flags when its saved copy reflects earlier records.

Saved letters are excluded from Growth Map sources, future letter capture counts and Grow's captured-experience narrative. They cannot receive achievement tags. This prevents an AI summary from recursively becoming new evidence or inflating activity totals. Portfolio visibility remains private initially; any later visibility change is the student's existing explicit action, with no new external sharing mechanism.

**Past letters** lists months already prepared/saved, newest first, plus the current previous month. Opening archives is read-only and never backfills years of paid AI requests. Arbitrary older months without an owned letter return 404; current/future or invalid months return 422.

Skill detail includes **Activity over time**: the current month and five preceding months, including zero months. Bars and a visible month/count table use identical values. The current month is labeled **so far**. Counts are confirmed evidence, not time spent, ability or rankings. Weekly study and explicit milestone/capture grouping retain Drop 1's rules; grouped practice belongs to its latest contributing date. History uses current live qualified evidence and is recalculated after source changes/hiding. It calls no AI and uses no new history table.

## Counts and evidence

Plain domain code owns all month boundaries, grouping, counts, trend rules and next-stage selection. Student timezone is used, including year rollover and the local first of a month.

- **Steps finished:** currently completed goal steps with a known completion date in the month.
- **Experiences captured:** non-letter portfolio experiences with a valid date in the month.
- **Programs saved:** retained, non-dismissed bookmarks whose creation time falls in that local month.
- **Application actions:** retained programs currently Applied/Result/Done with an actual known applied date from tracker records or the student's confirmed historical date. Bookmark creation is never substituted for application date. This is not program attendance.
- **Confirmed activities:** distinct canonical groups across visible skills, not raw tag count. This is the three-item letter threshold.
- **Skills grown:** the same supported Drop 1 rule, evaluated for the reported month: at least three items, prior activity in the two preceding months and current count above their average. No marker is fabricated for a new skill with no baseline.

Counts reflect records still in the account; deleting/reopening an item can lower a historical live summary. The provider receives aggregate counts, visible grown skills, a controlled idea, up to six opaque evidence IDs and permitted factual stories. Student names, location/school, raw activity titles, full reflections, hidden skills and other students' data are excluded. Raw source titles appear only in the owning student's UI. Saved portfolio reflections remain point-in-time student-owned copies.

## AI, caching and failure recovery

As in Drop 2, AI selects a bounded factual formulation rather than unconstrained prose. Returned text must match an allowed story under 120 words with exactly the supplied evidence IDs. Invented achievements, numbers, rankings, personality/health statements or admissions predictions cannot be accepted as arbitrary prose. A deterministic activity summary and next idea remain available when AI is off, unavailable, invalid or capped.

One persisted student/month row and a serializable token lease prevent concurrent generation. There is at most **one accepted AI attempt per student/report month**, including a provider failure or invalid response. Existing reserveAI enforces the daily student and shared monthly caps. There is no separate discovery/web-search charge or vector write. A pre-provider quota refusal restores the unused attempt slot and adds a one-minute cooldown; the UI rechecks and offers an explicit retry after that cooldown. It does not loop paid requests. An expired/abandoned lease reports failure and preserves the summary rather than spinning forever or replaying uncertain work.

After an accepted attempt, changed source facts do not trigger another paid call for that month. Reads revalidate source/evidence fingerprints and current visibility, falling back to a current deterministic summary if needed. An in-flight result is checked again against current evidence and AI consent before storage. Turning student AI consent off uses the deterministic summary instead of AI text. No reflection text is sent to a vector index or hosted tracing. Provider error bodies/prompts are not logged.

Optional `AI_MODEL_LETTER` overrides the task model; blank inherits `AI_MODEL_INSIGHTS`, then the existing task default (OpenAI gpt-4.1-mini, or configured Anthropic/Ollama model). No new required Secret or provider account is added. Paid SDK retries are disabled and the provider timeout is 25 seconds. Ollama retains its existing local JSON compatibility fallback within the accepted-request quota policy.

## First-of-month scheduling

The report becomes eligible when the previous month closes in the student's timezone. A bounded background worker runs hourly **while the server is awake**, preparing at most five due student/month rows per run under the existing maintenance-aware cross-instance job lease. It advances through missing rows, including quiet/AI-off summaries without provider calls. Quota-deferred rows can be retried after their cooldown. Completed/failed paid attempts are not replayed.

Replit Autoscale can sleep, so a timer cannot guarantee delivery at midnight on the 1st. Opening Growth Map performs an explicit POST to prepare a due previous-month letter, providing catch-up. Owners who need scheduled generation without visits can invoke the protected POST **/internal/growth-map/letters/run** with existing JOBS_SECRET from trusted scheduler tooling; each invocation remains bounded and metered. Invoke it regularly (for example hourly) to cover student-local month boundaries and drain multiple batches, rather than relying on one UTC-midnight request. Do not place that secret in a student frontend or URL. No email/push delivery or external scheduler is silently configured.

## API, storage and readiness

Authenticated, no-store student routes:

- GET /api/growth-map/letters — latest previous-month report, archive month list and preparation state; no writes/provider calls.
- GET /api/growth-map/letters/:month — owned archived or latest completed month, revalidated facts/story and source links.
- POST /api/growth-map/letters/:month/prepare — empty body; atomically prepares a due summary/one metered AI attempt. Controlled fallback statuses return 200; setup problems remain contained 503s.
- POST /api/growth-map/letters/:month/save — empty body; explicit idempotent verified private reflection save.
- POST /api/growth-map/letters/:month/plan — empty body; returns an ordinary AWAITING_APPROVAL proposal, no direct goal write.
- GET /api/growth-map/skills/:id/history — six student-local month/count rows for an owned visible skill; hidden/non-owned skills return 404.

The owner-only POST /internal/growth-map/letters/run uses the existing JOBS_SECRET Bearer header. Student saves, preparation and proposals are audited; no new agent writing tool is introduced.

One new **GrowthLetter** table stores month, bounded cached content/fingerprint, status, attempt/lease/cooldown metadata and an optional unique portfolio copy reference. It cascades with Student and exports under `growthLetters`. Deleting only the portfolio copy sets its pointer to null. No new Student or PortfolioEntry scalar fields are added. A missing letter table does not break session, Today, Drop 1, insights or the history chart; export tolerates pending letter setup. The readiness command/owner endpoint now checks **ten tables** with separate drop1Ready, drop2Ready and drop3Ready flags.

## Replit rollout and acceptance

1. Merge/sync this Drop 3 PR. Apply migration **20261108010000_growth_letters** to **development PostgreSQL** using `npm run db:sync:replit`. SQLite has an equivalent additive migration.
2. Build, then run `npm run check:growth` against that development database with its matching generated Prisma client. All ten tables and all three drop flags must be ready. The check is read-only; it does not apply schemas.
3. Publish and review/apply the **one new production table** (plus any earlier pending additions), preserving all existing records. Do not reset/overwrite the production database. Development readiness does not establish production readiness.
4. Use owner tooling to check the running production `/internal/growth-map/readiness` endpoint or run the read-only check against production. Never put database URLs or JOBS_SECRET in a shared screenshot/chat or browser URL. Only after production is ready, run signed-in checks below.
5. With a disposable profile containing three confirmed activities dated in the previous month, open the letter. Verify counts, source links, under-120-word story, optional grown skills and Plan it → Review → approval/VERIFIED. Do not falsify a real student's history to test this.
6. Save to portfolio twice: one private reflection, no new evidence. Open it in Grow, delete only the copy with confirmation, and verify the monthly archive remains. Verify an explicit re-save works.
7. Test an under-three month, AI off/capped/provider failure, a second profile's isolation, source deletion/hiding, month/year/timezone boundaries, export and account deletion. Charts must show six real months including zeros and the current partial month.
8. Check phone/desktop widths, all themes, keyboard/screen-reader table access and reduced motion. Existing Today/Explore/You and the earlier drops must still work. A build or /api/health alone is not a feature readiness check.


## Implementation verification

The implementation passes 558 tests across 65 files, type checking and a production build. PostgreSQL upgrade verification preserved existing students, captures, confirmed tags, insight cache and dismissals; readiness reported only Drop 3 missing before migration and all ten tables ready afterward. Actual Chromium checks against the production API/PostgreSQL cover phone/desktop widths in Dusk/Dark/Light, real source links, factual counts, archives, a quiet profile, verified portfolio save/delete and approval to VERIFIED, plus six-month chart/table values without page errors. Provider/allowance failures, consent-off summaries and concurrent saves are covered by API tests. AI tests use mocks and a local HTTP provider fixture through the actual adapter, without paid provider calls or live student/production records. These checks establish the code workflow, not a guarantee that an external provider or Replit scheduler is always available.
