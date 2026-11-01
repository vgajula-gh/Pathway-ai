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

All `/api/*` routes except config, access validation, health, session inspection and logout require either a valid account session with a still-allowed setup code, or `x-access-code` when `ACCESS_CODES` is configured (always required in production). Codes are comma-separated, trimmed, case-sensitive secrets; invalid or revoked codes return 401. Account sessions identify the student across devices; unlinked legacy profiles still require `x-student-id` and their original code until linked. A tester code alone never signs into a username-linked profile.

- `GET /api/config` (public): `{accessRequired, feedbackUrl}`; never exposes allowed codes.
- `POST /api/access` (public): `{code}` → `{ok:true}` or 401. The client stores the accepted code in sessionStorage and sends it with subsequent requests, including downloads.
- Student setup records `Student.accessCode`. It is excluded from profile responses and included only in the student's full data export.
- Buddy messages, extract, coach, and Today insight reserve one AI request before invoking a configured provider. Consent and AI-disabled behavior remain unchanged. `AI_DAILY_LIMIT` defaults to 20 per student per UTC day; `AI_MONTHLY_LIMIT` defaults to 1000 shared requests per UTC month. Both accept non-negative integers, including zero.
- A reached cap returns 429 with friendly `{error}` copy. Failed provider calls count; internal tool rounds/retries do not add feature requests. Transactional persistent counters prevent concurrent overspending. Other routes remain available. Deleting a profile removes its daily counters; anonymous monthly totals remain.

Production serves the built website and API from one origin/port; see `DEPLOY-REPLIT.md`.

## Returning students and account sign-in

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/auth/session` | Public, no-store; `{student: Student or null}` based on the account cookie. Invalid/expired/revoked sessions return null. |
| POST | `/api/auth/login` | `{username, password}` plus the original tester code → Student and an HttpOnly session cookie. Returns 401 for incorrect credentials or a mismatched setup code, 429 after 10 attempts per normalized username per 15-minute UTC window. |
| POST | `/api/auth/link` | Attach `{username, password}` to the current unlinked legacy profile using its original browser ID and tester code. Preserves all existing data, starts a session, and disables ID-only access for that profile. Returns 409 if already linked or username taken. |
| POST | `/api/auth/logout` | Revoke this device's session and clear the cookie; 204. Other signed-in devices remain signed in. |

`POST /api/students` accepts `credentials: {username, password}`. Required for new production profiles; optional for legacy local/demo compatibility. Username is case-insensitive, 3–30 ASCII letters/digits/underscores; password is 12–128 characters. New sign-ups store a uniquely constrained username and a password hash on the same Student record. Student responses and data exports include `username` but never password hashes or session tokens.

A session lasts 30 days, uses `HttpOnly; SameSite=Lax; Path=/`, and adds `Secure` in production. Only a hash of the random 32-byte cookie token is stored. Passwords use salted scrypt (N=32768, r=8, p=3); password values are never returned or logged. Mutation requests with an Origin header must come from the same host or an explicitly recognized local/Codespaces development origin. Browser clients include credentials; the production website/API share an origin. Removed tester codes also revoke account-session access. Account/session creation, login and logout are audited. Profile deletion cascades to all its sessions.

Returning authenticated students land on Today. A temporary server/network failure offers retry and preserves the remembered profile ID. New users explicitly select Create a profile. Existing students must link their profile in You → Account from their original browser once before signing in on another device. There is no password-recovery flow yet; students should save their credentials. No email, external identity provider or additional deployment Secret is required.
