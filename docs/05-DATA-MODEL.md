# 05 · Data Model

Source of truth: `apps/api/prisma/schema.prisma`.

| Entity | Purpose | Key fields |
|---|---|---|
| Student | Student DNA | name, grade, timezone, location (broad), interests[], skills[], aiConsent, budget, format, settings, **provenance** {field: {src, at}} |
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

## Conventions
- Local wall-clock datetimes `YYYY-MM-DDTHH:MM` + `Student.timezone`.
- JSON arrays/objects stored as strings for SQLite/Postgres portability. On Postgres you may migrate to `Json` columns.
- `onDelete: Cascade` from Student — deleting a student deletes everything (right to delete).
- Never store: exact home address, health data, sensitive inferences. Location stays broad.

## Switching to Postgres
Local development stays on SQLite. The build derives a PostgreSQL Prisma schema from `apps/api/prisma/schema.prisma`. In the Replit workspace, `npm run db:sync:replit` applies that schema to the development PostgreSQL database; Replit Publish applies the development-to-production schema diff. The application must not run schema migrations against Replit's production database at startup.
