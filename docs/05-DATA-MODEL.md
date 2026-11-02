# 05 · Data Model

Source of truth: `apps/api/prisma/schema.prisma`.

| Entity | Purpose | Key fields |
|---|---|---|
| Student | Student DNA and optional account | signInHash (nullable unique keyed hash), recoveryHash (nullable unique keyed hash), accessCode, name, grade, timezone, location (broad), interests[], skills[], aiConsent, budget, format, settings, **provenance** {field: {src, at}} |
| Availability | Capacity rules | studyStart/End, maxStudyMin, downtimeStart/End, source, lastVerified |
| Event | Calendar items | title, type, start/end (local), recurDays[], recurUntil, **source** (manual/upload/pathway/sample), confidence, done, proposalId |
| Opportunity | Normalized listing | organizer, url, category, gradeMin/Max, minAge, format, cost, commitment, skills[], tags[], checks[], deadline, **sourceCheckedAt** (null = unverified), isSample |
| SavedOpportunity | Student ↔ opportunity status | interested / preparing / applied / result (dismissed for discovery), student deadline, notes, checklist |
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

## PostgreSQL and deployment schema

Local development stays on SQLite. The build derives `apps/api/prisma/postgresql/schema.prisma` from the SQLite model and generates the production client. In the Replit workspace, `npm run db:sync:replit` applies the schema to the development PostgreSQL database; Replit Publish applies the development-to-production schema diff. Do not run production schema migrations or `db push` at application startup. New account and student-feature fields are additive so existing records are preserved. See `DEPLOY-REPLIT.md`.

SavedOpportunity now stores deadline (student-entered, separate from Opportunity.deadline), notes and a serialized checklist. Statuses are interested/preparing/applied/result; dismissed remains an internal discovery flag. Migration maps saved→interested and done→result without discarding notes or records.

CalendarLink stores student ownership, a label, maskedUrl, AES-256-GCM encryptedUrl, eventType, lastSync, syncAfter, leaseUntil and sanitized error. Event adds calendarId/importKey (unique together), readOnly and a cascading source relation. A successful sync atomically upserts its mirror and removes absent occurrences; failed syncs preserve events. Exports contain masked calendar metadata only, never the private URL or ciphertext.

NotificationSettings is one-to-one with Student (enabled=false, local time, pausedUntil). PushSubscription stores an endpoint hash and AES-GCM ciphertext, never plaintext endpoint/keys in API responses or exports. NudgeDelivery has a composite studentId/local-date primary key, status and accepted count; reserving before sends prevents duplicate daily nudges across processes. All three cascade on student deletion. Exports include settings and delivery history but exclude subscription capabilities.

## Shared discovery and program knowledge

| Entity | Purpose and fields |
| --- | --- |
| Student.region | Optional US state abbreviation/DC, `virtual`, or empty. Controlled values; no new address collection. |
| Opportunity | Nullable grade bounds; verificationStatus, verifiedAt, officialDomain, region[], costType, costAmount, costVerifiedAt, financialAidNote, feeFlag, discoveredFor[], source, evidence{}, requirements[], lastRecheckedAt. Existing seed records keep source=seed and their verification is never manufactured. |
| StudentPick | Student/opportunity composite key, bucket, rank, isStretch, pickedAt, refreshCycle. Both relations cascade; repeated reads preserve the original pickedAt. |
| OpportunityFeedback | Student/opportunity key, reason, createdAt. Separate from application progress. |
| PickRefreshState | Student key, rolling cycle start, last automatic refresh, manual count, one earned/used interest-change bonus and normalized interest signature. |
| DiscoveryGroup | Public normalized topic/grade-band/region key, short buckets, queue state, last discovery timestamp and safe error. No names, student IDs or exact locations. |
| SourcePage | Shared program relation, URL/title, readable snapshot text, contentHash, checkedAt; unique by program/URL. |
| KnowledgeChunk | Shared program relation, text, sourceUrl, pageTitle, checkedAt, contentHash, opportunity scope, embedding model/dimension identity. localEmbedding is used only by the memory adapter. |
| JobLease | Key, unique owner token, expiry; serializes jobs across timers, cron and replicas, with heartbeat. |
| DiscoveryUsage | UTC month key; run/re-check reservations, searches, pages, embeddings, vector writes, token estimates and planning cost estimates. No student content. |
| DiscoveryRun | Shared group/program key, kind, status, usage, sanitized error, start/end. Interrupted usage is explicitly incomplete, not presented as a provider invoice. |

SavedOpportunity adds `citedDeadline` and `citations` separately from the student's `deadline`. Saving pins a known official deadline so later shared-catalog changes cannot silently alter that student's application. Approved requirements merge into the checklist, preserving notes, completed steps and student-entered dates. Expiry removes recommendations, not application records. The upgrade copies existing checked catalog deadlines into saved applications.

Conversation optionally stores opportunityId. Program-message metadata includes checked citations and a rules-engine eligibility note. Exports include conversations/messages, picks, feedback and refresh state; student deletion cascades these private records. Shared catalog/snapshots/chunks contain public program information and remain reusable after a student deletes their account.

Four matching migrations for each provider: `20261103010000_personal_picks`, `20261103020000_discovery`, `20261103030000_knowledge`, `20261103040000_discovery_jobs`. Replit still uses development schema sync + Publish's schema diff. Migration-managed PostgreSQL installations can apply the versioned SQL; existing databases without migration history must be baselined first. The optional `prisma/postgresql/optional/knowledge-vector.sql` is deliberately outside ordinary migration history so Pinecone deployments never require extension privileges.


LangGraph/LangChain orchestration adds no tables. Program ChatMessage.meta.workflow and DiscoveryRun.usage.workflow reuse JSON strings for controlled node/status/reason records. Prisma continues to own durable sessions, job leases/cooldowns, usage reservations and student approvals; ephemeral graph state is not stored as framework checkpoints.
