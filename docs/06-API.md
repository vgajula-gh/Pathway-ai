# 06 · API Reference (v0)

Base URL `http://localhost:8787`. JSON in/out. Auth: HttpOnly account-session cookie; `x-student-id` is a migration fallback for unlinked legacy browser profiles only. Errors: `{ error, details? }` with 401/403/404/409/415/422/429/502/503.

| Method | Path | Purpose |
|---|---|---|
| POST | /api/students | Onboard (Student DNA + availability + optional goal + optional sample week) |
| GET / PATCH / DELETE | /api/me (settings: showWord, showNews, theme, newsTopics, voice) | Read / edit profile (updates provenance) / delete everything |
| GET | /api/me/export | Full data export (JSON) |
| GET | /api/today | Headline, rings, next action, timeline, coming up, pending proposals, word |
| POST | /api/today/insight | AI brief for today (cached) |
| GET | /api/events?from&to | Occurrences with clash flags |
| POST | /api/events | Add event (409 with `warning` on conflict unless `force`) |
| POST | /api/events/bulk | Save events the student confirmed from extraction |
| PATCH / DELETE | /api/events/:id | Mark done / delete |
| GET | /api/events/:id/ics | Calendar file (student-initiated download) |
| GET | /api/opportunities | Personal `picks[]` in Free/Paid buckets plus compatible ranked results and discovery status |
| GET | /api/opportunities/:id | One opportunity with fit |
| POST | /api/opportunities/:id/status | `{status: saved|dismissed|none}` |
| POST | /api/opportunities/:id/prep | Create prep proposal (save + reminder + goal + steps) |
| GET | /api/proposals[?status] · /api/proposals/:id | List / read |
| POST | /api/proposals/:id/approve · /reject | Execute with verification / decline |
| GET / POST | /api/goals · PATCH/DELETE /api/goals/:id | Goals |
| PATCH | /api/milestones/:id | `{status: todo|done}` |
| GET / POST | /api/portfolio · PATCH/DELETE /api/portfolio/:id | Portfolio (visibility) |
| GET | /api/buddy/conversations | Threads for Buddy home (title, updatedAt, messageCount) |
| GET / DELETE | /api/buddy/conversations/:id(/messages) | Read a thread / delete it |
| POST | /api/buddy/messages | `{text, conversationId?}` — omit id to start a new thread; returns `conversationId` |
| GET | /api/news | `{allTopics, topics, custom, stories[], top, emptyTopics, updatedAt}` filtered by the student’s topics |
| POST | /api/extract | Multipart `file` or `text` → candidate events (not saved) |
| POST | /api/coach | `{question}` → explanation |
| GET | /api/audit · /api/resources · /api/health | Activity log · curated resources · health + aiEnabled |

`settings.voice` is a boolean, defaulting to `false` for new and existing students. PATCH merges it with other settings and records the change in the activity log. It is included in data exports. Voice input and reply playback use browser speech APIs; there is no audio endpoint.

Full schema: `docs/openapi.yaml`.

`GET /api/health` returns `{ok, aiEnabled, provider}`. `provider` is `anthropic`, `openai`, `ollama`, or `null` when disabled. `aiEnabled` means configured, not a live provider readiness check; student AI consent is still required for AI requests. Health, discovery status and the opportunity list send `Cache-Control: no-store` so browsers do not reuse an old readiness response.

## Replit pilot access and AI caps

All `/api/*` routes except config, access validation, health, session inspection, phrase sign-in, recovery and logout require either a valid account session with a still-allowed setup code, or `x-access-code` when `ACCESS_CODES` is configured (always required in production). Codes are comma-separated, trimmed, case-sensitive secrets; invalid or revoked codes return 401. Account sessions identify the student across devices; unlinked legacy profiles still require `x-student-id` and their original code until linked. A tester code alone never signs into a phrase-linked profile.

- `GET /api/config` (public): `{accessRequired, feedbackUrl}`; never exposes allowed codes.
- `POST /api/access` (public): `{code}` → `{ok:true}` or 401. The client stores the accepted code in sessionStorage and sends it with subsequent requests, including downloads.
- Student setup records `Student.accessCode`. It is excluded from profile responses and included only in the student's full data export.
- Buddy messages, extract, coach, and Today insight reserve one AI request before invoking a configured provider. Consent and AI-disabled behavior remain unchanged. `AI_DAILY_LIMIT` defaults to 20 per student per UTC day; `AI_MONTHLY_LIMIT` defaults to 1000 shared requests per UTC month. Both accept non-negative integers, including zero.
- A reached cap returns 429 with friendly `{error}` copy. Failed provider calls count; internal tool rounds/retries do not add feature requests. Transactional persistent counters prevent concurrent overspending. Other routes remain available. Deleting a profile removes its daily counters; anonymous monthly totals remain.

Production serves the built website and API from one origin/port; see `DEPLOY-REPLIT.md`.

## My applications
`GET /api/applications` lists the student's saved tracker with deadline provenance/countdown/checklist progress. `PATCH /api/applications/:opportunityId` accepts status (interested/preparing/applied/result), deadline (real YYYY-MM-DD or null), private notes and checklist [{title,done}]. `POST /api/applications/:id/prep` proposes reminders/study blocks only in real free time before the known deadline; no fallback booking or AI is used. Approval revalidates with the existing engine. Today returns `dueSoon` for active applications within seven student-local days. Saving an opportunity pre-fills checks plus official-deadline confirmation.

## Calendars and week view
`GET/POST /api/calendars` lists masked links or adds `{label,url,eventType?:class|personal|other}` and performs an initial sync. `POST /api/calendars/:id/sync` refreshes the mirror; `DELETE /api/calendars/:id` removes it and its imported events without changing the provider. URLs accept HTTPS/webcal, never credentials or private-network destinations; redirects are rechecked, DNS is pinned, and responses are limited to 2 MiB. Public URL validation does not promise provider availability. `GET /api/week?from=YYYY-MM-DD` returns seven student-local days, load, clashes and events. Imported events reject direct edits/deletion and agent move/remove proposals. They feed the same engine as manual events.
Calendars expand from 30 days back through 180 days ahead, at most 3,000 occurrences, honoring TZID/RRULE/EXDATE/RECURRENCE-ID. Floating times use X-WR-TIMEZONE or student timezone. High-frequency rules fail visibly instead of exhausting the server; prior data remains intact. All-day items become date markers, not 24-hour class blocks. A persistent lease coordinates 3-hour syncs; a minute poll starts on boot.

## Installation and gentle notifications
`GET /api/notifications` returns preferences, student timezone, subscription count and public VAPID configuration (never private key/subscription URLs). `PATCH` accepts enabled, time (07:00–20:59), pauseWeek boolean. `POST /api/push/subscribe` saves a browser-generated HTTPS push subscription (vendor endpoint allowlist, encrypted at rest with the VAPID private key); `POST /api/push/unsubscribe` removes that student's endpoint and disables nudges if no devices remain. `POST /api/notifications/test` is an explicit action, respects opt-out/pause/quiet hours/classes, and consumes the same local-day allowance. Responses distinguish accepted by service, not delivered, unconfigured, quiet/paused and already sent. Never claim device delivery from an HTTP acknowledgement.
The minute scheduler evaluates each student's local chosen time, retries evaluation after class ends but not after 9pm, and reserves a unique student/local-date delivery before external sends. Failures/crashes are not retried automatically: at-most-once takes priority. Selection is deterministic: active application due within three days → exam/deadline tomorrow → pending approval → light-day goal suggestion → nothing. A service worker also suppresses delayed notifications on another date, in quiet hours or during the class snapshot carried by the nudge. Settings are off by default and require a student browser permission gesture.
The service worker caches only public HTML/JS/CSS/icons, never APIs or student data. Offline opening shows a shell and connection guidance; data/features still require the server. Notification clicks choose only an allowlisted app tab.

## Private phrase sign-in and recovery

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/auth/session` | Public, no-store; `{student: Student or null}` from the account cookie. |
| POST | `/api/auth/login` | Public: `{phrase}` → existing Student and HttpOnly session cookie. No invitation, username, or student ID needed. |
| POST | `/api/auth/link` | Current unlinked legacy browser profile plus original invitation: `{phrase, confirmPhrase}` → same Student plus one-time `recoveryCode`. |
| POST | `/api/auth/change-phrase` | Signed-in session: `{phrase, confirmPhrase}` → same Student plus a new one-time recovery code. Revokes every old session and recovery code, then signs this device back in. |
| POST | `/api/auth/recover` | Public: `{recoveryCode, credentials: {phrase, confirmPhrase}}` → same Student plus replacement recovery code and a session. Recovery codes are single use; old sessions/phrase are revoked atomically. |
| POST | `/api/auth/logout` | Revoke this device's session and clear the cookie; 204. |

`POST /api/students` accepts `credentials: {phrase, confirmPhrase}` (required in production; optional for legacy local/demo compatibility). Phrases are 12–128 characters after Unicode normalization, trimming, collapsing whitespace and lowercasing; input is capped at 128 characters. Confirmation must match. The secret phrase must be unique across profiles; conflicts return 409. Failed sign-in/recovery returns generic 401. Removed tester invitation codes still revoke sign-in/session access.

Only keyed HMAC-SHA256 hashes of phrases and recovery codes are stored, using a persistent server-only `SIGN_IN_SECRET` (at least 32 random characters in production). This key must stay stable across deployments/instances and be backed up separately from the database; changing it makes existing phrases and recovery codes unusable. Development has a clearly local-only fallback. No raw phrase/code appears in ordinary profile responses, exports or logs. Profile responses expose only `hasSignIn`; a recovery code is returned only when created or replaced. The random 24-byte recovery code is displayed once with a Copy button and save acknowledgement.

Throttling for login, recovery, registration and phrase changes persists across instances: 100 attempts per IP per 15-minute window, 10 per credential hash per 15-minute window, and 500 shared per minute. Exceeded limits return 429; changing guessed phrases cannot bypass the IP/shared limits. Production trusts only the nearest reverse-proxy hop for the client IP. Mutation Origin checks protect cookie-authenticated requests.

Sessions last 30 days with `HttpOnly; SameSite=Lax; Path=/` and `Secure` in production. Only a SHA-256 hash of each random 32-byte session token is stored. Expired sessions/counters are pruned, profile deletion cascades sessions, and account state changes are audited. Invitation codes are required only to create/link profiles and for legacy browser-ID migration. Returning signed-in students open Today; others see phrase sign-in before any invitation gate. Temporary load failures preserve the remembered profile and offer retry. Students who lose both their phrase and recovery code can change their phrase from a signed-in device; without one, there is no identity-based recovery because no email is collected.

### Sign-in integration with notifications
The browser sends its optional push endpoint with `/api/auth/logout` so the server can revoke this student's device subscription before ending the session. Changing/recovering a private phrase revokes all subscriptions and turns nudges off alongside invalidating old sessions. Students can opt in again on their trusted devices. Onboarding includes both an optional calendar step and required phrase confirmation; the recovery code is still shown once before the dashboard.

## Active-only Explore and student-scoped knowledge

- `GET /api/config` adds demoMode (default false). Onboarding ignores sampleWeek unless true.
- `GET /api/today` adds student-local greetingPart and dueSoonEvents (exam/deadline events within seven days); nextAction is null with no suggestion. dueSoon remains Interested applications. The client renders glance → next step → spark.
- `GET /api/opportunities` returns active eligible picks, fit/countdown/cost/Verified fields, interestedCount, canAskAll, knowledgeStates (program ID → ready/preparing/unavailable), preparing and independent knowledgeUnavailable. A first visit may enqueue one initial request; sufficient recent shared catalog results are reused. No paid models run during this GET. Discovery fields include discoveryEnabled, unavailable, finding, limited, error, resultIds, lastCheckedAt, refresh and search `{phase,found,detail,startedAt,finishedAt}`. Failed searches return safe errors rather than claiming refreshed results.
- `POST /api/opportunities/refresh` returns **202** with requested/requestId plus status. It reserves a manual base/bonus slot; successful complete/empty settlement charges once. Failed/limited/cancelled searches leave the allowance intact. Consent off → 403, no interests → 422, allowance/global cap → 429, missing search setup → 503. Catalog refills use no AI. The explicit manual action queues a new web search even with a full shortlist. Calls for the same pending request coalesce.
- `POST /api/discovery/run`, authenticated, strict empty JSON `{}`: bounded request work for the student’s own persisted search groups and program preparation. No client-selected groups/program list. Returns skipped if locked, otherwise discovered/prepared counts. Provider attempts run only under the shared lease and budget reservations. A page polls every five seconds while searching/preparing; timers/cron finish unattended work.
- `GET /api/discovery/status` returns enabled/unavailable for AI consent + search configuration, independently of embedding/index readiness. It settles finished requests and reports the real current request, not merely a historic group error. Search phases: idle, queued, searching, reading_sources, checking_facts, indexing, cached, complete, empty, failed, limited, cancelled. Status reads call no paid AI models.
- `POST /api/opportunities/:id/status` accepts saved/dismissed/none with an optional controlled dismissal reason. Interested pins source-backed requirements/citations/deadline on creation, preserving existing notes/completed work. Removing a card deletes the derived pick immediately; the next list read refills its bucket with no AI. Interested applications remain even after expiration.
- `POST /api/buddy/messages` accepts `{text,conversationId?,opportunityId?}` or `{text,conversationId?,scope:"my_opportunities"}`. Scope/opportunityId are mutually exclusive; arbitrary ID-list fields are rejected. SQL recomputes membership from current active StudentPick + non-dismissed Interested records and explicit feedback; outside-set requests/follow-ups return 403 before an AI charge. Conversations inherit their saved scope. Cross-program replies are grouped by name and include scope and programs `{id,name,canAddRequirements}`; single-program replies include opportunityId. Citations include number, optional chunkId, opportunityId, sourceUrl, pageTitle, checkedAt. Structured facts are SQL/rules output, textual claims are verified excerpts, with at most three retrieval/model rounds. Existing daily/monthly AI request caps apply.
- `POST /api/opportunities/:id/requirements` requires membership, creates an AWAITING_APPROVAL source-backed proposal, and execution also requires an Interested application with unchanged evidence. Unknown/currently stale evidence → 422. Approval merges checklist steps and citedDeadline while preserving user notes, dates and completed steps. No external application is submitted.
- `POST /internal/jobs/run` accepts the owner bearer JOBS_SECRET (at least 32 characters), no student session. Missing setup → 503, wrong bearer → 401. Returns skipped if leased, otherwise `{expired,refreshed,discovered,prepared}`. Timers and cron share the same lock. Monthly refresh never alters Interested records; source checks run monthly and at the seven-day deadline boundary.

Search and preparation attempts reserve the overall AI_MONTHLY_LIMIT without charging a student’s daily counter. DISCOVERY_MONTHLY_BUDGET additionally limits search runs. DISCOVERY_RECHECKS_PER_MONTH bounds both source rechecks and standalone program preparation. Global reservations include failures; manual successful-search allowances are separate. AI_DISABLED disables all paid work. Budgets are attempt counts, not dollar ceilings. Setting DISCOVERY_ENABLED=false stops search while existing configured program Q&A/preparation can still work; use AI_DISABLED=true or zero overall allowance to stop all paid calls.

Knowledge readiness checks the index dimension/metric without calling a paid model. Optional failures show fixed setting-name explanations and retry connection checks after one minute. SQL snapshot/model/store checks prevent obsolete vectors from becoming answers. General workflow records contain controlled stage/reason metadata only. Public vector/chunk data has no student fields; private request state is included in export and cascades on deletion.

Foreground work handles a search group or a standalone program preparation per call, keeping slow providers within the web request window. Timer/cron work shares a three-minute run deadline, checked before funding another stage; a final in-flight provider call can finish after that deadline. Paid nodes are never automatically replayed.
