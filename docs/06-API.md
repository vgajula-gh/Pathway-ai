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
