# 06 · API Reference (v0)

Base URL `http://localhost:8787`. JSON in/out. Auth (dev): header `x-student-id`. Errors: `{ error, details? }` with 401/403/404/409/415/422/429/502/503.

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
| GET | /api/opportunities | `{recommended[], excluded[], dismissed, sampleData}` with fit factors |
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

All `/api/*` routes except config, access validation, and health require `x-access-code` when `ACCESS_CODES` is configured (always required in production). Codes are comma-separated, trimmed, case-sensitive secrets; invalid or revoked codes return 401. Student routes still require `x-student-id` and the same code recorded at onboarding. This pilot gate is not individual account authentication.

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
