# Growth Map — Drop 1

Growth Map is a separate private module reached through **You → Your Growth Map**. Direct links use `?tab=you&view=growth-map`; ordinary section navigation and browser Back remain available. Grow continues to own goals, learning and portfolio captures. This drop implements GM-1 through GM-14. AI insights/opportunity matching belong to Drop 2; letters/charts to Drop 3. No AI or Pinecone call is made by this drop.

## Student flow

Capture an experience, complete a goal step, complete a non-recurring Study block, or mark a program Interested/Applied. Pathway opens a skill review using up to three deterministic catalog matches. Suggestions begin unselected; existing confirmed tags remain selected. Students may search catalog names/synonyms, select up to ten tags, adjust supported experience stages and explicitly confirm. Skipping or closing creates no evidence. Older activities appear in review batches (ten by default, maximum twenty); previously reviewed items remain accessible. Changed source state reopens review eligibility. Rejected source/skill suggestions stay rejected unless the student explicitly chooses that catalog skill again.

The shared catalog contains 70 versioned skills in STEM, Engineering & tech, Business, Creative, Leadership & service, and Communication. Its stable IDs are seeded in both migration histories. Keyword/synonym matching uses title/type context and existing self-reported skill labels, not full reflection text. Missing skills can be requested; requests remain pending for owner review and never silently expand the catalog. The owner can review the private `SkillRequest` queue in their database tooling, then add approved catalog entries through a versioned code/migration change. This drop adds no owner messaging or family sharing.

## Evidence policy

- Evidence is self-reported activity, not a verified achievement or ability score. Only explicit confirmed tags create SkillEvidence rows. Reads never backfill/confirm tags or invoke AI.
- Portfolio captures use their recorded dates. Projects default to Build, service/club roles to Apply, presentations/publications to Present, competitions to Compete, and learning/certificates to Learn. Students may correct the stage they actually experienced.
- Completed goal steps default to Learn, or Build when their title describes making something. Reopened/deleted steps stop contributing immediately.
- Study must be marked done, non-recurring, not a sample outside demo mode, and already ended. The student explicitly confirms the subject-related skill. No course, attention or learning is inferred from a scheduled block alone. Study is grouped once per skill per student-local Monday–Sunday week; detail lists every contributing block. Group date is its latest activity date. These are practice records, not measured study-time tracking.
- Interested/Preparing programs can receive confirmed interest tags, represented without completed evidence or a reached ladder stage. Applied is Apply, not attendance. A competition result may be explicitly tagged Compete if the student actually entered. New tracker transitions record their student-local date in the existing audit record. Historical applications without a known transition date require the student to confirm a date; bookmark creation is never substituted for application date.
- Capturing a completed milestone offers a link to that step. Confirming the link counts both records as one activity per skill, retaining source links and supported stages. Students can unlink it. This links explicit records; it does not guess that similarly named records are the same activity.
- Counts, stages and connections revalidate the student's live sources. Deleted/reopened/future items never linger as completed evidence. Future-dated or unfinished activities cannot receive confirmed evidence tags. Changes to an activity’s title, type, date, completion state or application status require a fresh review before its tags count again; moving a study block into the future does not silently reactivate its evidence when that time passes. Stars with no remaining live tagged sources leave the visible map; hidden preferences/history remain private. Source identity rows may remain in export as confirmation history, but contain no copied reflection/title snapshots.

## Map and skill details

Map shows up to twelve confirmed skills, ordered by focus, evidence count, recency and name. More skills remains accessible. Star size reflects grouped evidence count; recent activity in the last thirty local calendar days changes brightness; area determines color. Lines reflect skills confirmed on the same activity, with explicit milestone/capture duplicates collapsed. Labels remain readable regardless of brightness. Interest-only stars are outlined; starting interests are faint, clearly labeled and never counted as experience.

List view exposes all skills, area, counts, highest supported stage, last activity, recent count, Growing/focus markers and connections. The same detail screen opens from either view. Each reached stage links to its evidence. Stages can occur out of order: Compete never silently checks Learn/Build/Apply/Present. The next stage follows the highest reached one; this drop labels it Next, without inventing an in-progress activity. At Compete there is no fabricated sixth stage.

Under three distinct grouped activities, show **Your map grows as you do** and a capture action. Three skills on one project still represent one activity. Hidden-only maps instead offer Show hidden skills. Confirmed interests do not advance the threshold. Zero/reduced history is never padded with sample achievements.

Growing means at least three evidence items this calendar month, more than the average of the preceding two calendar months, with at least one evidence item in those prior months. It describes recorded activity, not improved ability; it is not a normalized comparison of elapsed month lengths. All windows use the student's timezone. Monthly focus is a single row per student/month, changeable or clearable; a new month starts without an automatic focus. Hiding the current focus clears it.

Skill correction reassigns only the student's catalog association and can override their display area. Duplicate source tags merge and the global catalog is unchanged. Hidden skill evidence is retained and excluded from the visible map/connections; restoration is explicit. Skill source detail rechecks ownership and opens the actual recorded title/date/type, reflection, goal context, study time or application notes/status as appropriate.

## Data and API

New shared `Skill` plus student-owned `StudentSkill`, `SkillEvidence`, `SkillTagSuggestion`, `GrowthFocus`, `GrowthReview`, `SkillRequest`. Student-specific rows cascade on account deletion and appear under `growthMap` in Export my data; the shared catalog remains. GrowthReview stores a hash of source state, not a duplicate reflection/title. Suggestions pending review are computed; confirmed/rejected decisions are persisted. Unique source/skill keys and serializable confirmation/focus transactions protect idempotency and concurrency. Private source data is never indexed in the shared vector database.

All Growth Map endpoints require the existing student authentication and return no-store. Each source, evidence and write is scoped to that student. Mutations are direct explicit student actions and audited; no new agent writing tool is added. Future AI-created goals must continue through proposals. Invalid inputs return 422; missing/non-owned sources return 404. A pending schema migration returns a contained 503 from Growth Map; session/Today do not load its new relations.

See API/OpenAPI for exact paths. The source list uses offset/limit and all=true for reviewed items. The source confirmation accepts tags, an optional actual application date and an optional owned completed-milestone link. Empty selection marks reviewed/removes that source's prior tags. Selecting a hidden skill does not silently restore it.

## Deployment and owner acceptance

1. Merge this drop, sync Replit and apply development PostgreSQL additions with `npm run db:sync:replit` if needed. Review Publish's production schema additions before republishing. Preserve existing production data; no reset/overwrite.
2. Expect only seven new tables/catalog rows, no existing Student scalar fields or destructive table rebuild. No new Secret or provider key is required. SQLite and PostgreSQL migrations both seed the same catalog.
3. Confirm a returning student can open Today/Explore/You. Open Growth Map: a new profile shows interests and capture; an existing profile shows reviewable activities without automatic achievements.
4. Capture a Python project. Select Coding, confirm Build. Open the map/list, Coding detail and its actual source. Confirm it appears once even if saved again. Complete/capture the same milestone and accept the explicit link: still one activity.
5. Complete two subject-related Study blocks in the same week and confirm the same skill: one evidence item with both blocks listed. Undo/delete source activity and verify counts update after reopening/refreshing the map.
6. Choose focus, switch views, correct an assignment, hide and restore a skill. Verify another student sees none of these records. Test AI disabled and capped: all Drop 1 features remain usable.
7. Mark an opportunity Interested, confirm tags: no reached stage. Mark Applied, review again, confirm date/Apply: one application action, not claimed attendance. Existing old applications require an explicit date.
8. Export growth data, then delete a disposable test profile; its private rows disappear while the catalog remains. Check phone keyboard/touch access, all themes and reduced motion. Use real student data only with the student's permission; local/browser validation uses synthetic fixtures.

## Acceptance coverage

| Requirements | Coverage |
|---|---|
| GM-1 | You preview of top three evidence skills and separate private route |
| GM-2–5 | Twelve-star bound, more skills, recency/area/connection legend, supported Growing rule, full List equivalent |
| GM-6–7 | Single monthly focus and honest new/hidden/empty states |
| GM-8–11 | Source-linked details, independent ladder stages, personal correction and reversible hiding |
| GM-12–14 | Rules-first suggestions at activity actions, explicit/manual confirmation and historical batches |

Automated tests cover catalog seeding, confirmation/idempotency/rejections, student isolation, source changes, weekly deduplication, stages, focus concurrency/month rollover, corrections, historical dates, export/cascade, unavailable migration, UI review/list/map/source controls and existing sign-in flows. Drop 1 validation passed 494 tests, type checking and the production build. A PostgreSQL upgrade from the prior migration history preserved a synthetic legacy profile/capture. A production-mode API check verified schema-only catalog bootstrap, concurrent confirmation and student isolation. Real Chromium checks against that PostgreSQL API covered 320/390/1024-pixel layouts in all three themes, source links, focus, hide/restore, deep links and a fresh capture/confirmation flow. The schema comparison showed only the same pre-existing timestamp differences on Opportunity/ResearchCandidate as the main-branch baseline; no new Growth Map drift was introduced. These checks used disposable local data, not the published database. The wireframe's sample counts, AI cards and letters are not production content in Drop 1.

Catalog bootstrap also runs from the existing seed/start path. It upserts only the public 70-skill catalog, so Replit's schema-only Publish path works even when it does not execute the migration's INSERT statements. A missing Growth Map table/column is tolerated by this bootstrap and contained by the feature API; existing startup/session routes do not depend on a new Student scalar. Other database errors remain real errors. Local db:setup includes this catalog seed as well.


Drop 2 is specified separately in [Growth insights](17-GROWTH-INSIGHTS.md). Its AI/cache/matching behavior does not change Drop 1 evidence or confirmation rules.
