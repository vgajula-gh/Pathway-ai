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
1. `docker compose up -d` 2. `DATABASE_URL=postgresql://pathway:pathway@localhost:5432/pathway` 3. set `provider = "postgresql"` 4. `npm run db:setup`. For production use `prisma migrate` instead of `db push`.

SavedOpportunity now stores deadline (student-entered, separate from Opportunity.deadline), notes and a serialized checklist. Statuses are interested/preparing/applied/result; dismissed remains an internal discovery flag. Migration maps saved→interested and done→result without discarding notes or records.

CalendarLink stores student ownership, a label, maskedUrl, AES-256-GCM encryptedUrl, eventType, lastSync, syncAfter, leaseUntil and sanitized error. Event adds calendarId/importKey (unique together), readOnly and a cascading source relation. A successful sync atomically upserts its mirror and removes absent occurrences; failed syncs preserve events. Exports contain masked calendar metadata only, never the private URL or ciphertext.
