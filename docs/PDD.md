# Pathway product design: Today, Explore and program knowledge

Current Explore policy: [Explore simplification](15-EXPLORE-SIMPLIFICATION.md) supersedes older active-only/eligible/source-fresh admission, separate watchlist, cost-hint quotas and six-card visibility rules below. Only a confirmed past deadline hides a result. Other details remain warnings/ranking factors. SQL stores search links before enrichment; unreadable details produce visible unconfirmed results. Source evidence, privacy, proposals, knowledge scope and AI limits remain enforced. This simplification adds no schema migration.

This is the current design for these modules; [01-PRD](01-PRD.md) remains the wider product brief. Pathway is a private student-success companion, with deterministic facts and approved plan changes.

## Today

Use a slim first-name greeting/date. Order: Your day at a glance (rings, compact timeline, Due soon within seven days), Next best step (pending approval first, Do it/Later/Why, Explore empty state), Today's spark (word/news preferences). Keep Buddy’s floating orb. Add event and Link calendar are explicit actions on an empty day.

The rings are **Study planned**, **Free time left**, and **Progress**. Study planned is today's scheduled Study-event minutes divided by the student's daily study limit, including blocks already marked done; it does not measure completed work or attention. Free time left is unbooked time still ahead today inside the configured study window, excluding protected downtime. Show remaining unbooked protected downtime separately beneath the rings, with a warning for calendar events overlapping it. Count overlapping bookings once and clip ongoing events to now. These are calendar estimates from the student's own events (manual, confirmed scan, linked calendar or approved proposal) and availability settings in You; no activity tracking or AI calculation. Progress remains completed/planned goal steps for the current week. Refresh Today every minute while visible and on return/focus, without an AI call. With default windows, an empty calendar at 8 PM shows 1h free and 2h protected downtime, separately; after 9 PM free time is zero.

Timeline opens in **Today**, with an inline **Today | Week** toggle. Week is a vertical Monday–Sunday agenda in the student's timezone, with Previous week / This week / Next week navigation. Show all seven dated groups, highlight today and label empty days Nothing scheduled. Choosing a day sets the default date for Add event; current week initially selects today, other weeks select Monday. Keep Scan schedule and Link calendar available. Both views show the same sources, overlap warnings and completion state. Students can mark non-recurring, writable Study/Reminder/Personal events done or undo completion; recurring and linked events retain their existing restrictions. A failed save never claims completion. Switching views or browsing weeks makes no AI call and changes no events. Rings and Due soon stay about today. Ignore obsolete week responses and allow read failures to retry without blocking Today. Editing/rescheduling is outside this change. No migration or new Secrets.

### Deletion and extra sparks

Writable Timeline rows have a small minus control in Today and Week. Confirm before using the existing DELETE endpoint; recurring rows explicitly confirm deletion of the entire series. Linked-calendar rows remain read-only. After success, reload Today/Week so calendar quantities update; failure leaves the event visible.

Word of the day stays student-local. Next word walks through a curated 500-word practice set (meaning, part of speech, original example, optional Hear it); Today’s word returns to the daily selection. Practice survives minute refreshes, resets on a new local day and repeats after the full set. No AI, account write or new tracking is involved.

News has Next story for browsing and Refresh news for an explicit live publisher check, also available inside the news sheet. Public RSS/Atom endpoints are fixed by topic: NASA, BBC News/BBC Sport and ScienceDaily. Save only recent dated publisher entries with real article links and source-provided summaries; no model writes news. A shared persistent 15-minute feed cache prevents repeated fetches across students/servers; failures back off one minute and preserve previous real stories. GET never starts ingestion. Partial, cached, failed and empty states are explained honestly. Sample news is visible only in demo mode. No new API key, schema migration or quota reset is needed.

## Explore

Start with the shared SQL catalog, without dummy recommendations. Interested is shown only when applications are saved. Optional You/Explore preferences affect ranking and warnings, not qualification. Only a confirmed past deadline hides a result. Missing/mismatched grade, area, format, cost, source review/freshness and application status stay visible with checks. Unknown deadlines never imply open applications. Verified requires actual source support; unconfirmed links show Needs checking.

Research starts only after an explicit Search action, checks existing relevant links first, and searches missing interests within the normal caps. Default evidence-first research returns optional reported details, then checks one page without a second extraction AI call. Persist links before enrichment, recover actual citations when research JSON is unreadable, and retain links when extraction fails. A partial-results message explains incomplete details. Explore displays up to five confirmed Free and five Paid or cost-unconfirmed options, ordered by fit across the unexpired catalog. The server retains its existing primary-pick and paid-search targets; remaining links stay stored for refill. Both cost groups are expanded. Six relevant links can meet total coverage even if prices are unknown. Student B can reuse the same public catalog without new provider work.

Literal-source checks still establish facts; unsupported values remain unknown. Interested/Not for me preserve each student's choices. Plan, reminder and requirements changes require approval. Successful partial searches use the ordinary successful-search allowance; failed/empty searches without usable results do not, while paid attempts remain counted globally. Explicit retries wait one hour and have a shared daily unsuccessful-attempt bound; estimated spending is reserved before paid work. No automatic provider retries or quota resets are added.

See [Explore simplification](15-EXPLORE-SIMPLIFICATION.md) for the current contract and recovery/deployment checklist; it supersedes the original stricter Scout admission rules.

## Shared knowledge and trust

Each public program’s source pages and approximately 500-word/50-word-overlap chunks are stored once. SQL owns text, citations and student membership; Pinecone holds public vectors in opportunities. A card’s Ask action becomes available only when chunks match source hashes, embedding identity and the selected vector index. Server-derived StudentPick + Interested membership governs single-program and my_opportunities retrieval on every turn. Cross-program responses are grouped; database/rules supply structured facts; the verifier accepts only exact supported excerpts for text answers, with sources/check dates and a three-round retrieval ceiling. No answer is invented when an official page does not say.

Requirements buttons create proposals; approval revalidates source evidence, merges steps and reports VERIFIED/FAILED. Nothing submits an external application. Student data is exportable/deletable; no profile data is sent to Pinecone. DEMO_MODE defaults false; intentional sample demos are labeled. Manual sample cleanup protects student references and never runs at startup.

The complete Scout contract, caps, ranking and owner test flow are in [14-OPPORTUNITY-SCOUT.md](14-OPPORTUNITY-SCOUT.md). The SQL LangGraph runner persists each stage; foreground calls advance one bounded network stage and never automatically replay an unknown paid outcome.

## Growth Map — Drop 1

A separate private module in You implements GM-1–14 from the Growth Map requirements: versioned catalog, explicit skill confirmation, source-linked evidence, constellation/List, ladder, monthly focus, personal correction/hiding and historical review. It uses no AI or shared vectors. [Growth Map contract and acceptance](16-GROWTH-MAP.md) defines source/date/deduplication policies, deployment and the deferred drops.
