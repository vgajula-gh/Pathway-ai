# Pathway AI — current product specification

**Release baseline:** GitHub `main` at `1878d9e`, including merged Growth Map Drops 1–3 (PRs #25–27). **Document scope:** implemented pilot behavior, not an aspirational roadmap. “Released” here means present in that main-branch implementation. Provider configuration, production schema readiness, publisher connectivity, browser support and hosting availability must be verified separately for a deployed site. This review does not inspect production Secrets, live student records or production database state.

This document supersedes older conflicting feature descriptions in the original PRD and earlier Scout designs. The matching technical specification is [End-to-end agentic architecture](04-ARCHITECTURE.md). [OpenAPI](openapi.yaml) remains the detailed API contract; [Replit deployment](../DEPLOY-REPLIT.md) is the operator guide.

## 1. Product purpose and audience

**Make the most of today. Build a better tomorrow.** Pathway AI is a private student-success companion for high-school students in grades 9–12. It helps a student discover opportunities, understand daily commitments, act on manageable next steps, and connect experiences to a growth story.

The four product pillars are Discover, Simplify, Grow and Prepare. Calendar planning supports those outcomes; the product is broader than a planner. Its outputs are suggestions, recorded activities and transparent source-backed information, not grades, ability scores, admissions predictions or comparisons with other students.

The current account holder is the student. Parent/counselor accounts, family dashboards, teacher administration and school-wide role permissions are not released. A portfolio “shared” flag exists, but it does not establish a separate authorized family portal or send anything to another person.

## 2. Navigation and feature inventory

| Surface | Released capability | Dependency or boundary |
|---|---|---|
| Get started / Sign in | Tester invitation codes, private sign-in phrase, recovery code, returning-profile restoration | Owner-managed access codes; persistent sign-in secret in production |
| Today | Greeting, three factual rings, protected downtime, Today/Week agenda, due-soon items, next step, words and sourced news | Core estimates and navigation work without AI |
| Explore | Catalog-first opportunity search, up to five Free and five Paid/cost-unconfirmed cards, preferences, program details and application tracking | New web research needs configured search, consent and allowance |
| Buddy | Conversation threads, bounded tools, proposal creation, program questions and optional browser voice | LLM required; program questions also need prepared knowledge |
| Grow | Goals, steps, completion, learning coach, portfolio captures and saved growth reflections | Manual records work without AI; explanations need a provider |
| You | Profile and availability, account controls, calendars, notifications, appearance, privacy, export/delete, feedback | Optional integrations appear according to setup/browser support |
| Growth Map, reached from You | Confirmed skills/evidence, constellation and List, ladder, focus, hiding/correction, insights, next steps, monthly letters, history | Separate from Grow; deterministic map works without AI |
| Owner tooling | Diagnostics, fixture/live checks, feature readiness, job execution and guarded pilot reset | Protected APIs/CLI; not a student admin dashboard |

## 3. Access, onboarding and returning students

### 3.1 Invitation versus identity

Visitors enter an owner-issued access code when the pilot gate requires one. `ACCESS_CODES` accepts comma-separated allowed values. The code used at registration is recorded against the student; it is not exposed in ordinary profile responses. Removing a code from the allowed set can prevent linked accounts using that invitation from authenticating.

Access codes are not individual sign-in credentials, a seat count or a fixed student-capacity setting. A code may be reused unless the owner distributes it otherwise. Hosting capacity and shared AI/search allowances determine practical pilot capacity; adding codes does not increase those allowances.

### 3.2 First setup

The student supplies a name, grade, interests, timezone, broad region and study/rest preferences, and can supply an initial goal. Setup includes an AI-help choice. Production registration requires the student to choose and confirm a private sign-in phrase. It is normalized and must contain at least 12 characters; there is no username, password pair or email requirement.

The application displays a generated recovery code that the student must keep. Authentication stores keyed hashes, not the readable phrase/recovery value. A successful sign-in creates an HttpOnly cookie session, currently lasting 30 days. Recovery replaces the phrase/recovery credential and revokes old sessions; changing a phrase also invalidates prior sessions and notification subscriptions. Login attempts are throttled persistently.

A returning authenticated student restores the saved profile and can continue on the dashboard without repeating Get started. The private phrase opens that profile on another device. Legacy browser-only profiles can be linked to a phrase; their compatibility path is intentionally more limited than the current account flow.

Production starts without an invented semester, sample student or dummy opportunity catalog. Sample demonstrations are explicit and require demo mode. Basic registration does not require a calendar connection or AI key.

## 4. Today: understand the day and choose a next step

Today presents a first-name greeting and student-local date, followed by **Your day at a glance**, the timeline, due-soon information, the next best step, and Today’s spark. The floating Buddy control opens the conversational assistant.

### 4.1 Rings and their meanings

| Ring | Actual data and calculation | What it does not claim |
|---|---|---|
| Study planned | Scheduled Study-event minutes for today against the configured daily study limit; completed blocks remain scheduled minutes | Measured concentration, screen time or completed studying |
| Free time left | Remaining unbooked time today inside the study window, excluding protected downtime; overlapping bookings count once | All waking time, a mandate to fill every minute, or time outside availability |
| Progress | Completed versus planned goal steps for the current week, using target dates and recorded completion dates | A grade, streak, personality judgment or ability score |

Unbooked **protected downtime left** is displayed separately. Calendar bookings overlapping that rest window produce a warning. Calculations use stored events, recurrence, local time and availability rules; they do not ask a model to do date math. Today refreshes each minute while visible and on return/focus without an AI call.

Tapping a ring opens its contributors/explanation. An empty calendar or ended study window yields honest empty/zero quantities rather than a fabricated plan.

### 4.2 Today and Week timeline

The Today/Week toggle changes the agenda, not the meaning of the rings. Week is a Monday–Sunday vertical view in the student's timezone, with previous/current/next-week navigation, a highlighted today, empty-day labels and a selected date for event creation.

Students can add an event, scan a schedule, or link a read-only calendar. Supported writable, non-recurring Study/Reminder/Personal rows offer completion/undo. Imported calendar rows remain read-only. A small minus control deletes a writable event after confirmation; deleting a recurrence means deleting the entire series, which is explained before confirmation. Overlaps, event source and completion state remain visible in both views.

Manual event entry can report conflicts and allow an explicit override. A reviewed schedule scan is saved through its explicit confirmation flow. These student actions are distinct from agent-created plans, which require the proposal workflow.

### 4.3 Due soon and next step

Due soon combines upcoming exams/deadlines and saved-program application dates within seven days, with countdowns and uncertainty labels. A waiting proposal is prioritized in the next-step area. Otherwise deterministic rules can point out an upcoming assessment, conflict, overdue step or saved opportunity without a plan.

**Review** opens the pending proposal; **Do it** can route to Buddy/Explore to work on the issue; **Later** dismisses the current prompt in the interface; **Why** explains the information used. These buttons do not silently execute a plan. The API also supports an explicitly requested AI daily brief, cached by local date; the normal Today display and its measurements do not require that generation endpoint.

### 4.4 Words and news

**Word of the day** is selected deterministically in student-local time. **Next word** browses a curated 500-word practice set with meaning, part of speech, an original example and optional browser read-aloud. **Today’s word** returns to the daily selection. It uses neither AI credits nor a stored ability score; this is practice, not a spaced-repetition assessment engine.

**News for you** supports chosen topics: Space, Science, AI & Tech, Health & Medicine, Climate & Nature, Arts & Culture and Sports. **Next story** browses stored publisher stories; **Refresh news** explicitly checks fixed RSS/Atom sources, including NASA, BBC and ScienceDaily. Headlines and summaries come from publisher metadata, never AI-written replacement news. Stories carry real links, publisher and date information.

A shared 15-minute cache limits repeated feed fetching. Failed feeds back off and existing real stories remain available; partial/empty results are described honestly. Words/news can be hidden in You. Network access is needed to fetch new stories, but no news API key is required.

## 5. Explore: recommendations, research and applications

### 5.1 Catalog-first recommendations

Explore first uses the shared SQL program library. It ranks non-sample, unexpired entries using the student's interests and optional preferences. **Only a source-supported past deadline excludes a result under the current policy.** An unknown deadline does not mean applications are open.

Grade, location, format, time, fees, source freshness/review and application status affect ranking and warnings. Missing facts stay unknown. **Verified** and **Needs checking** are different states: a returned URL or a model assertion alone cannot establish verified details.

The visible recommendation lists contain up to **five confirmed Free** and **five Paid or cost-unconfirmed** options. Unknown fees are not presented as free. The rest of the catalog remains stored for refill/reuse. Fewer available matches yield fewer cards, with an explanation; there is no guarantee of ten results.

The older default primary-pick/search coverage settings of three Free and three Paid are backend planning targets, not the current display limit. Catalog coverage can be met by six relevant links despite unknown pricing, with interest coverage checked separately.

### 5.2 Search for more

The Search/Find opportunities control checks current catalog coverage before authorizing new public web research. Student A's fetched public programs can be reused by Student B; private profiles, bookmarks and progress are not shared.

When coverage is missing, the system queues bounded public research for missing interests. Search receives the selected interests, grade band, date and sanitized broad location/format/cost-group context. The separate name/identity fields, schedules, personal project text and sign-in credentials are not forwarded to the public search prompt; explicitly entered interest/location text is still data the student supplies.

Results are stored as named links **before** optional source enrichment. In default evidence-first mode, the worker checks a program page and tries to confirm research quotations against real fetched text. An unreadable/PDF/blocked source or incomplete details can leave a visible **Needs checking** link. Valid citations/URLs from the actual research response can be recovered when its JSON is unusable. The system does not invent fallback program URLs.

The interface reports progress, partial results, failures, unavailable setup, exhausted budgets and reset/retry times. Already stored recommendations remain useful when a new search cannot run. The app may prepare selected-program knowledge separately; catalog visibility does not require every result to have a Pinecone vector.

### 5.3 Preferences and search allowances

Preferences include interests, broad region/city/state/radius, online/in-person choice, optional goals/project description, weekly time and maximum cost. They support local ranking and checks; they are not a second calendar or a reason to silently discard all uncertain programs.

There are separate limits: a rolling personal successful-search allowance, shared monthly research-batch count, overall AI reservations, and an estimated discovery spending budget. A failed/empty search without useful results preserves the personal successful-search slot, while already incurred paid attempts remain counted. Explicit retries have cooldown/daily bounds. Interest changes can earn a configured additional refresh. Section 11 explains the units; access codes do not change these limits.

### 5.4 Program details and tracking

Students can open a program page, inspect known details and source evidence, mark **Interested**, or choose **Not for me**. Choices remain private to that student. The application tracker moves through **Interested → Preparing → Applied → Result** and supports notes, an editable checklist, manual/source-backed deadlines, countdowns and next steps.

A manual deadline is labeled as student-entered and unverified. **Plan my prep**, prep reminders and importing official requirements create proposals. Official requirement/deadline proposals revalidate source evidence before merging into a saved application; existing notes/completed work are preserved. No action submits an application or registers the student externally.

### 5.5 Ask about a program

When actual page text has been prepared for a program, Buddy can answer within that program or **My opportunities**. Scope comes from the student's current picks and Interested records, rechecked by the server on every turn. A client/model cannot supply an arbitrary cross-student program allowlist.

Structured dates, cost and eligibility come from database/rules. Descriptive answers use verified exact excerpts with citations and check dates. If the pages do not answer, Buddy says so. Missing vectors or mismatched embedding/index settings disable the program-question feature without removing catalog cards or applications.

## 6. Buddy and the learning companion

Buddy supports new conversations, follow-up threads, earlier messages, suggested starters, visible tool activity and attached proposal reviews. General Buddy can inspect a student's schedule, find free slots, check a draft plan, search the **existing** opportunity catalog, retrieve curated learning resources and scoped public program passages, and propose changes.

The tool named `search_opportunities` searches SQL; it does not independently launch unrestricted web browsing. New web research belongs to Explore's bounded workflow. General Buddy uses a bounded provider tool loop, currently six rounds, rather than a collection of independent autonomous agents.

Personal Buddy can receive the student's request, recent conversation, name, profile/preferences, goals and relevant tool data when AI help is enabled. This is different from the deliberately restricted public Scout/Growth prompts; the product does not claim that no personal data ever reaches an AI provider.

**Learning companion**, in Grow, gives explanations/examples/practice for a question, with an academic-integrity instruction not to produce graded work. General coaching language is not verified by the same exact-excerpt process as program answers, and prompt rules are not a substitute for a separate moderation or fact-checking system.

### 6.1 Voice and schedule scanning

Voice is optional and off by default. On supported browsers, enabling Voice lets a student dictate into an **editable draft**; sending remains explicit. Reading new replies aloud is a separate session choice with a stop control. Leaving Buddy or disabling Voice stops listening/playback. Pathway does not upload/store audio; browser speech services may process it under their own handling. Typing remains available and there is no realtime audio-agent backend.

Schedule scanning accepts text or supported images, asks a configured model for candidate events, and presents a review/edit preview. The student confirms selected events before import. Images/text supplied for extraction are sent to the chosen model provider. Image parsing requires a capable configured model; the default local text model is not a promise of vision support. No automatic cloud-photo archive or live microphone schedule capture is implemented.

## 7. Grow: goals, steps and the portfolio

Students can create goals, inspect progress, mark goal steps complete/undo, and remove goals. Agent-generated goals and steps arrive through approval; direct student forms are explicit actions. Completion records—not model praise—supply weekly progress and Growth Map evidence opportunities.

Portfolio capture records what the student did, with title, kind, date, reflection and chosen self-reported skills. Supported capture choices include projects, volunteering/leadership/club work, competitions, courses/reading/certificates and presentations/showcases/publications. Entries start private, can be marked shared through the existing visibility control, exported or deleted. The visibility marker does not deliver an email or create a family login.

Saved monthly growth letters appear as readable reflection entries in Grow. They can be deleted independently of the monthly archive and are excluded from experience/evidence inflation.

## 8. Growth Map: all three drops released

Growth Map is a separate private screen under **You → Your Growth Map**, with a preview of the top three evidence-backed skills. It links confirmed experiences to a versioned catalog of **70 skills** across six areas. It is not an ability assessment or an admissions predictor.

### 8.1 Confirmation and evidence

Capturing an experience, completing a goal step or supported Study block, and marking a program Interested/Applied can open a skill review. Rules suggest up to three catalog matches; suggestions start unselected. The student may add catalog skills manually, adjust supported stages and explicitly confirm up to ten tags. Closing/skipping the review creates no evidence. Existing records can be reviewed in batches. Rejected suggestions stay rejected unless explicitly chosen again.

| Source | Evidence interpretation |
|---|---|
| Portfolio project | Self-reported Build experience by default |
| Completed goal step | Learn or Build by default; reopened/deleted steps stop contributing |
| Completed, ended, non-recurring Study | Explicitly confirmed subject practice, grouped once per skill per local week |
| Interested/Preparing program | Interest tag only, no completed evidence or reached stage |
| Applied program | Application action, not attendance; an actual applied date is required |
| Presentation/showcase/publication or entered competition | A corresponding self-reported experience, not automatic proof of a prize |
| Explicitly linked milestone and capture | One activity per skill, retaining the source links and separately confirmed stages |
| Saved growth letter | Reflection only; never new skill evidence |

Future/unfinished activities cannot receive completed-evidence confirmation. Source edits/date changes/completion changes require a fresh review before earlier tags count again. Reads revalidate current sources; deleted/reopened records do not remain as completed evidence.

### 8.2 Map, List and skill detail

The constellation displays up to 12 confirmed skills, with remaining skills under More skills. Size reflects evidence count, brightness recent recorded activity, color skill area, and lines skills confirmed on shared activity. Interest-only stars are outlined. List provides the same facts in text: area, evidence count, recent/last activity, supported highest stage, focus/growing markers and connections.

The ladder is **Learn → Build → Apply → Present → Compete**. Each reached stage needs its own evidence. A later stage never silently checks earlier stages. Next is a possible following experience, not a fabricated in-progress task.

The student can choose one monthly focus, correct their own catalog assignment/display area, hide a skill and explicitly restore it. Missing skills can be requested for owner review; a request never changes the shared catalog automatically. New/under-three-activity and all-hidden states provide honest alternatives to invented achievements.

**Growing** requires at least three items this month, a positive comparison with the previous two-month average and some actual earlier baseline activity. It means more recorded activity, not increased measured ability. A brand-new skill does not receive an invented historical comparison.

### 8.3 Grounded insight cards

With at least three confirmed activity groups and student AI consent, Growth Map can show up to three insight types: growing activity, a repeated reflection theme, a skill connection or a next rung. Every card has **Based on** source links and **Not me**. Dismissal signatures persist; changed counts do not revive the same dismissed idea, and repeated type dismissals lower that type's priority.

Code computes counts/trends/qualification; AI selects from bounded factual formulations under 35 words with exact permitted evidence IDs/actions. Raw reflections, activity titles, identity and hidden/dismissed options do not enter this prompt. Cached cards are checked against current evidence/visibility/consent before display.

A due weekly refresh occurs on a visit through an explicit preparation request; an additional manual refresh is allowed once per student-local day. Existing global/daily AI limits apply. Provider errors/caps retain valid dated cache, and the map remains usable. Quota cooldown and abandoned-lease recovery prevent a permanently disabled button or endless spinner.

### 8.4 Next rung and programs

The map and skill detail provide a deterministic next-stage idea, favoring the monthly focus. Up to two existing program-library matches must match the skill and an explicit program stage/type; expired, sample and student-dismissed records are excluded. Unknown program details retain checks. Viewing these matches starts no new web research. **View in Explore** opens the selected program; **Make this a goal** creates a reviewable goal/step proposal.

### 8.5 Monthly letters, archives and history

For the previous completed student-local month, the letter shows a story under 120 words, recorded steps/captures/saves/application actions, supported grown skills, source links and one optional next-month idea. Under-three months get a gentle note without AI. Unknown historical application dates are not replaced by bookmark dates, and saved letters do not count as new experiences.

Eligible letters have at most one accepted metered AI attempt per student/report month. Quiet months and AI-off/failed/capped cases have a deterministic activity summary. Changed evidence invalidates stale prose without a second paid attempt for that report month. **Plan it** requires approval; **Save to portfolio** is a separate explicit, verified, private snapshot save with duplicate protection. Deleting only the copy leaves the archive available.

Letters become due after month close. An hourly worker processes bounded batches while the server is awake, and visits catch up missed work. Replit Autoscale can sleep; exact first-day processing without visits requires owner scheduler calls. No email/push letter delivery is configured automatically.

Skill detail includes six monthly evidence counts: the current partial month plus five earlier months, including zeros. Bars and a visible accessible table show identical values. Source changes/hiding update the live chart; it does not call AI or measure study hours.

## 9. You, integrations and student controls

| Control | Current behavior |
|---|---|
| Student profile | Edit name, grade, broad location/region, interests, self-reported skills and availability; key fields show provenance |
| Opportunity preferences | Edit local ranking/search preferences without duplicating the schedule |
| Account | Link/change phrase, use recovery, sign out; returning profiles persist across devices |
| Read-only calendars | Up to ten private HTTPS iCalendar subscriptions; encrypted stored URL, masked display, sync/remove controls; imported events cannot be edited locally |
| Calendar sync | Polling checks due links; the configured sync interval is three hours, with explicit sync cooldown and failure isolation |
| Phone calendar export | Download a calendar file for a student-selected event; the student opens/imports it in their calendar app |
| Gentle nudges | Explicit opt-in/browser permission, chosen local time, pause for a week, device subscription controls, test request; quiet/class checks and at most one reserved daily nudge |
| Push setup | Requires VAPID owner configuration and supported browser/device; service acceptance is not guaranteed device delivery |
| Appearance/install | Dusk, Dark, Light or device appearance; PWA install support and cached shell depending on browser; not a full offline workflow |
| Privacy | AI help and Voice toggles, news/word controls, visible activity log |
| Export/delete | JSON export of private records including all Growth Map data; delete-everything removes the student's profile and dependent records |
| Feedback | Send feedback opens owner-configured FEEDBACK_URL; no automatic email is sent |

## 10. Privacy and action boundaries

All personal records are private by default. Public program pages, catalog entries and public knowledge chunks may be shared across students; each student's membership, preferences, chats, goals, application progress and Growth Map remain scoped to that account.

The model cannot directly execute arbitrary SQL, write a calendar, send an email or submit an external application. It can request approved tools and create a proposal. Explicit student CRUD actions—adding an event, confirming tags or saving a letter—are separate authenticated actions and do not masquerade as autonomous AI writes.

There are authorized outbound operations: provider inference, public research/source/feed fetching, read-only calendar fetching and opted-in browser push. “No automatic external applications/messages” does not mean the server makes no network requests. [Architecture section 10](04-ARCHITECTURE.md#10-data-boundaries-and-trust) details exactly what crosses each boundary.

Private-phrase accounts have session/origin/access checks and persistent throttles. Legacy browser-ID compatibility is not equivalent to current account authentication. Exact-source and bounded-template verification protect specific workflows; general chat/coaching still relies on model behavior and prompt guardrails. No claim of a complete legal certification, comprehensive moderation service or universal factual correctness is made.

## 11. Allowances and graceful degradation

| Setting or limit | Unit and behavior |
|---|---|
| AI_DAILY_LIMIT | Accepted interactive AI requests/reservations per student per UTC day; default 20 |
| AI_MONTHLY_LIMIT | Shared accepted AI reservations, including supported shared jobs, per UTC month; default 1,000 |
| DISCOVERY_MONTHLY_BUDGET | Shared funded research-batch attempts per UTC month, default 10; not dollars or number of students |
| DISCOVERY_MONTHLY_SPEND_USD | Owner-configured estimated discovery spending/reservations, default $25; not a guaranteed provider billing ceiling |
| Personal opportunity refresh allowance | Rolling cycle, default 30 days; default one successful manual refresh, with a possible earned extra; failed/empty results do not consume a successful slot |
| Growth insight refresh | One automatic attempt after seven elapsed days plus one manual attempt per local calendar day; metered AI limits also apply |
| Growth letter generation | At most one accepted attempt per student/report month; quota rejection before a provider request preserves that unused attempt |
| Feed and source caches | Public library/knowledge/feed reuse reduces repeated network/provider work; stored cards remain useful without a new search |

These defaults are code defaults, not a statement about the owner's current Secrets. One accepted request can contain multiple bounded provider/tool rounds; quotas are not a count of every HTTP call or exact token cost. Paid failures remain counted where a reservation was accepted. Actual vendor billing and hosting capacity are external to these counters.

When AI is disabled/capped, manual events, the timeline, factual rings, existing catalog/application data, goals, captures, confirmed skills, charts and deterministic next steps remain useful. New research and model explanations stop or show controlled failures. Valid insight cache and factual monthly summaries remain available as their specific consent rules permit. A third-party outage is contained to the affected feature rather than treated as loss of student records.

## 12. Deployment and owner operations

The released Replit deployment builds the web/API and runs one Fastify process serving static assets and /api from the same PORT on 0.0.0.0. PostgreSQL is the production database through DATABASE_URL. SQLite remains available for local development; Replit development uses its separate PostgreSQL database.

Production startup generates the appropriate Prisma client but deliberately does **not** run schema DDL. Apply versioned migrations to development; review/apply production additions in Replit Publish. Never use a development reset/push command against production. A successful build and /api/health do not prove every feature table exists.

Growth Map has ten tables across three releases: seven for core evidence, two for insights and one GrowthLetter table. The read-only **npm run check:growth** and owner-protected readiness endpoint report drop1Ready/drop2Ready/drop3Ready. Check the correct development and production database separately.

Owner diagnostics can expose public research stages, model identity, failures, page/candidate outcomes and estimated usage. Fixture/configuration checks differ from live paid tests. Existing JOBS_SECRET protects job/diagnostic endpoints and belongs only in trusted tooling, never URLs or student code. Guarded pilot reset tooling can clear students/allowances while preserving the shared library; it is an owner maintenance operation, not a student button or automatic troubleshooting step.

## 13. Released versus not released

| Capability | Status in the audited baseline |
|---|---|
| All five tabs, cross-device phrase accounts, code gate and recovery | Implemented |
| Calendar import, phone calendar download, browser voice, PWA and gentle push | Implemented, conditional on configuration/browser permission/support |
| Catalog-first research, links-first recovery, 5+5 display, tracker and scoped program knowledge | Implemented, conditional on provider/source/index readiness |
| Growth Map GM-1–23, all three drops | Implemented and merged |
| Complete autonomous application submission, email sending or external calendar editing | Not implemented |
| Parent/counselor portal, student-to-student comparison, admissions scoring | Not implemented |
| Realtime audio model conversation, full offline operation, automatic midnight execution on a sleeping host | Not guaranteed/implemented |
| General-purpose web-browsing tool for Buddy, a swarm of independently writing agents, LangGraph approval interrupts/checkpoint database | Not implemented |
| Missing-skill request review dashboard, broad school administration or hosted analytics dashboard | Not implemented; current owner work uses code/diagnostic/database tooling |
| Complete automated production migration/promotion gate | Not implemented; readiness tools and explicit Publish review are required |

## 14. End-to-end journeys and acceptance

1. **Return and orient:** invitation → profile/phrase/recovery → future sign-in restores the profile → Today explains scheduled study, remaining free time, rest and due-soon work without AI arithmetic.
2. **Discover and prepare:** choose interests → reuse shared catalog → research only missing coverage → retain unconfirmed links with checks → Interested → reviewed prep/requirements proposal → approve → observe actual saved result → track Applied/Result without claiming attendance.
3. **Resolve a schedule issue:** describe a conflict → Buddy reads/checks the schedule → proposes a feasible change → student approves → transactional execution/read-back → VERIFIED or FAILED, with audit history.
4. **Build a growth story:** capture/finish practice → explicitly confirm skill tags → inspect real evidence and independent ladder stages → focus/hide/correct → read grounded insights and next-step ideas → approve a small goal if wanted.
5. **Reflect on the month:** read a completed-month letter or quiet note → inspect counts/sources → plan by approval or save a private reflection → browse archives and six-month charts → delete/export own data.

A release is accepted when those flows work for separate profiles; unknown/expired details, source changes and AI-off/capped/error states remain honest; mobile/keyboard/table alternatives work; and schema readiness is checked in production. For this documentation update, **558 tests across 65 files passed**, and API/web type checks passed. No application behavior or schema was changed. These checks do not establish live vendor availability, production Secret values or universal model-answer quality.

## 15. Implementation traceability

| Product area | Principal implementation references |
|---|---|
| Identity/access | [accounts](../apps/api/src/lib/accounts.ts), [access](../apps/api/src/lib/access.ts), [onboarding](../apps/web/src/pages/Onboarding.tsx) |
| Today/timeline/words | [Today](../apps/web/src/pages/Today.tsx), [metrics](../apps/api/src/domain/metrics.ts), [remaining time](../apps/api/src/domain/remaining-time.ts), [word selection](../apps/api/src/domain/words.ts) |
| Calendar/notifications/news | [calendar routes](../apps/api/src/routes/calendars.ts), [nudges](../apps/api/src/lib/nudges.ts), [news routes](../apps/api/src/routes/news.ts) |
| Explore and research | [Explore](../apps/web/src/pages/Explore.tsx), [requests](../apps/api/src/discovery/requests.ts), [Scout runner](../apps/api/src/scout/runner.ts), [current sourcing contract](08-OPPORTUNITY-AND-NEWS-SOURCING.md) |
| Buddy and approvals | [Buddy](../apps/api/src/agent/buddy.ts), [tool registry](../apps/api/src/agent/tools.ts), [proposal service](../apps/api/src/lib/proposals.ts) |
| Program answers | [scoped Buddy](../apps/api/src/knowledge/buddy.ts), [retriever](../apps/api/src/knowledge/retriever.ts), [scope](../apps/api/src/knowledge/scope.ts) |
| Grow/portfolio | [Grow](../apps/web/src/pages/Grow.tsx), [growth routes](../apps/api/src/routes/growth.ts) |
| Growth Map | [core contract](16-GROWTH-MAP.md), [insights](17-GROWTH-INSIGHTS.md), [letters/history](18-GROWTH-LETTERS.md) |
| Data/deployment | [Prisma model](../apps/api/prisma/schema.prisma), [production start](../scripts/start-production.mjs), [deployment guide](../DEPLOY-REPLIT.md) |
