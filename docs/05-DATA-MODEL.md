# 05 · Data Model

Source of truth: `apps/api/prisma/schema.prisma`.

| Entity | Purpose | Key fields |
|---|---|---|
| Student | Student DNA and optional account | signInHash (nullable unique keyed hash), recoveryHash (nullable unique keyed hash), accessCode, name, grade, timezone, location (broad), interests[], skills[], aiConsent, budget, format, settings, **provenance** {field: {src, at}} |
| Availability | Capacity rules | studyStart/End, maxStudyMin, downtimeStart/End, source, lastVerified |
| Event | Calendar items | title, type, start/end (local), recurDays[], recurUntil, **source** (manual/upload/pathway/sample), confidence, done, proposalId |
| Opportunity | Normalized listing | organizer, url, category, gradeMin/Max, minAge, format, cost, commitment, skills[], tags[], checks[], deadline, **sourceCheckedAt** (null = unverified), isSample |
| SavedOpportunity | Student ↔ opportunity status | saved / dismissed / preparing / applied / done |
| Goal / Milestone | Growth journey | title, priority, targetDate, opportunityId; steps with effortMin, targetDate, status |
| PortfolioEntry | Achievements | type, title, date, reflection, skills[], evidence, **visibility** (private/shared), verification |
| AgentAction | Proposal | origin, summary, rationale, actions[], dataUsed[], effect, status, idemKey, result, createdIds[], log[], expiresAt |
| AuditEvent | Audit trail | actor (student/pathway/system), event, record, at |
| Conversation | Buddy thread | title (first message), updatedAt |
| ChatMessage | Buddy history | conversationId, role, content, meta {toolEvents, proposalIds} |
| NewsStory | Sourced news | topic, headline, summary (neutral paraphrase), source, url, publishedAt, checkedAt |
| DailyBrief | Cached AI insight | (studentId, date) → JSON |

| AuthSession | Account sign-in on a device | tokenHash (SHA-256), studentId (cascade), expiresAt; no raw token stored |
| LoginAttempt | Persistent sign-in throttle | hashed IP/credential/shared-window key, count, expiresAt; expired counters pruned on login |

## Conventions
- Local wall-clock datetimes `YYYY-MM-DDTHH:MM` + `Student.timezone`.
- JSON arrays/objects stored as strings for SQLite/Postgres portability. On Postgres you may migrate to `Json` columns.
- `onDelete: Cascade` from Student — deleting a student deletes everything (right to delete).
- Never store: exact home address, health data, sensitive inferences. Location stays broad.

## Production PostgreSQL

`npm run build` derives `apps/api/prisma/postgresql/schema.prisma` from the SQLite model and generates the production client. `npm start` runs the versioned PostgreSQL migrations; it never pushes a development schema. New fields are nullable for existing students, who can link their profile without losing data. See `DEPLOY-REPLIT.md`.
