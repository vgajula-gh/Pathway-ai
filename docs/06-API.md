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

All `/api/*` routes except config, access validation, health, session inspection, phrase sign-in, recovery and logout require either a valid account session with a still-allowed setup code, or `x-access-code` when `ACCESS_CODES` is configured (always required in production). Codes are comma-separated, trimmed, case-sensitive secrets; invalid or revoked codes return 401. Account sessions identify the student across devices; unlinked legacy profiles still require `x-student-id` and their original code until linked. A tester code alone never signs into a phrase-linked profile.

- `GET /api/config` (public): `{accessRequired, feedbackUrl}`; never exposes allowed codes.
- `POST /api/access` (public): `{code}` → `{ok:true}` or 401. The client stores the accepted code in sessionStorage and sends it with subsequent requests, including downloads.
- Student setup records `Student.accessCode`. It is excluded from profile responses and included only in the student's full data export.
- Buddy messages, extract, coach, and Today insight reserve one AI request before invoking a configured provider. Consent and AI-disabled behavior remain unchanged. `AI_DAILY_LIMIT` defaults to 20 per student per UTC day; `AI_MONTHLY_LIMIT` defaults to 1000 shared requests per UTC month. Both accept non-negative integers, including zero.
- A reached cap returns 429 with friendly `{error}` copy. Failed provider calls count; internal tool rounds/retries do not add feature requests. Transactional persistent counters prevent concurrent overspending. Other routes remain available. Deleting a profile removes its daily counters; anonymous monthly totals remain.

Production serves the built website and API from one origin/port; see `DEPLOY-REPLIT.md`.

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
