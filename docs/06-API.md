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

`GET /api/health` returns `{ok, aiEnabled, provider}`. `provider` is `anthropic`, `openai`, `ollama`, or `null` when disabled. `aiEnabled` means configured, not a live provider readiness check; student AI consent is still required for AI requests.

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

## Personal Free/Paid discovery

- `POST /api/students` and `PATCH /api/me` accept optional `region`: US state/DC abbreviation, `virtual`, or empty. Unknown address-like values are rejected. A meaningful normalized interest change earns at most one bonus manual refresh per rolling cycle.
- `GET /api/opportunities` retains `recommended`, `excluded`, `dismissed`, `sampleData` for compatibility and adds `picks`, `discoveryEnabled`, `finding`, `limited`, safe `error`, `lastCheckedAt`, and `refresh: {available, remaining, nextAvailableAt}`. Each pick includes bucket, rank, isStretch, verification/cost metadata, costLabel and canAsk. Picks exclude Interested/dismissed/ineligible/stale/expired items. Free requires explicit official cost evidence and costVerifiedAt. Empty slots are permitted. Paid includes unknown costs. A free-only preference still computes Paid; the UI collapses it.
- `POST /api/opportunities/:id/status` still accepts saved/dismissed/none; saved means Interested. Dismissal optionally includes reason: `not my interest`, `too much time`, `too far`, `cost`, `other`. The next list read refills only missing catalog slots. Direct student actions are audited; they do not invoke AI.
- `POST /api/opportunities/refresh` accepts an empty body. Requires configured discovery and student AI consent, then reserves a persistent manual allowance, rebuilds catalog picks and queues only short-bucket group searches. Defaults: one refresh per 30 days plus at most one meaningful-interest-change bonus. A reached allowance returns friendly 429; missing optional configuration returns 503. Catalog replacements remain available.
- `GET /api/discovery/status` returns `enabled`, queue/failure state and refresh availability. The web polls the opportunity list every six seconds only while a group is queued/running.
- `POST /api/buddy/messages` accepts `{text, conversationId?, opportunityId?}`. Supplying opportunityId starts a scoped program conversation; later messages reuse its saved scope. The response and stored message metadata add citations `{number, chunkId, sourceUrl, pageTitle, checkedAt}`, opportunityId and eligibilityNote. Scoped tools cannot query another program or write student data. Unsupported claims yield the official-page no-answer message. Existing AI consent/daily/monthly request limits apply, including retrieval rounds within that feature request.
- `POST /api/opportunities/:id/requirements` creates a source-backed proposal for an existing Interested application. Unknown requirements/current deadline → 422. Approval verifies the catalog evidence hash again and either merges checked requirements/citedDeadline with a VERIFIED result or fails with no partial writes. No application is submitted externally.
- `POST /internal/jobs/run` accepts an empty body and `Authorization: Bearer <JOBS_SECRET>` (owner secret, at least 32 characters). Missing server configuration → 503; incorrect/missing bearer → 401. Returns `{skipped:true}` if another worker holds the lease, otherwise `{skipped:false,result:{expired,refreshed,discovered}}`. It uses no student invitation/session. Authorization headers are redacted. Do not call it from browser code or expose the secret as VITE_*.

Automatic refresh never changes saved applications. Source dates are excluded per student's local day; global catalog expiry waits until the date has passed everywhere (UTC−12). Interested keeps its record and shows a passed-deadline notice using the student's local day. Discovery usage budgets are separate from interactive AI request quotas; setting AI_DISABLED=true disables both paid discovery and AI chat while deterministic refresh/expiry/catalog features work.

Shared discovery and source re-check attempts also reserve one request against the existing **AI_MONTHLY_LIMIT** overall counter. They never consume a student's daily allowance. Their separate discovery/re-check run budgets are additional limits; an exhausted overall AI cap blocks new paid background attempts too.
