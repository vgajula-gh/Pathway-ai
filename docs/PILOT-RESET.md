# Guarded production tester reset

This operation is **prepared, not automatically executed**. No startup/build hook
resets data. It does not create or independently verify a platform backup.
By default the owner must obtain a restorable production backup and verify the
restore procedure. Do not proceed on the strength of a label or an unverified
export. Alternatively, an owner may explicitly waive the backup and accept
permanent student-data loss. The receipt records that waiver; it never falsely
claims a backup was taken. New registration does not restore deleted records.

## Scope and safeguards

- Only the reviewed published host `pathway-ai.replit.app`, production runtime,
  PostgreSQL, and the existing `JOBS_SECRET` owner authentication are accepted.
  The host came from deployment metadata. A domain change requires reviewing
  both the server target and CLI, not overriding a safety flag.
- No new Secrets, invitation codes, limits, tables or migrations are needed.
- Production requests, startup seeding/knowledge initialization and
  discovery/knowledge/calendar/nudge workers register
  durable activities before doing work. Maintenance serializes admission using
  an existing `JobLease` row and blocks new API work, including registrations.
- Wait for the new deployment rollout to finish before starting. Maintenance
  requires at least five minutes plus **zero** activity records, live worker
  locks and live calendar leases. Expired activities still block: an expiry is
  not proof that a process stopped. Investigate stale blockers; do not clear
  them blindly. Cancel maintenance if needed before executing.
- A disconnected owner command does not resume traffic. Maintenance has no
  automatic expiry. A failed reset transaction rolls back and stays paused.
- Do not edit the database manually, run an external scheduler using old code,
  or perform another deployment during the maintenance window.

## Owner workflow

Publish this code normally first, keeping existing production data. This only
installs the operation; it does **not** reset anything. Wait until rollout is
complete. Commands below run from the workspace root, using the existing
`JOBS_SECRET` securely from the process environment. Never paste a key into an
argument, URL, screenshot or chat. Do not use the workspace DATABASE_URL.

1. Inspect production without changing it:
   ```
   npm run pilot:reset -- --url https://pathway-ai.replit.app --action status
   ```
2. Block admission (no deletion yet):
   ```
   npm run pilot:reset -- --url https://pathway-ai.replit.app --action start --confirm-production pathway-ai.replit.app
   ```
   Keep the returned operation ID. API users will see maintenance responses.
3. Wait at least five minutes and read `status` again. Confirm all blockers are
   zero, including expired activities. In Replit's **Database → production →
   Settings**, obtain a production backup taken **after** the drain window,
   confirm it is restorable, and retain it securely outside Git. The app cannot
   inspect the platform backup: execution requires the owner's attestation.
   Preview's SQLite backup is not a production backup.
4. Read `status` once more. Review the target, library identities/counts, student
   count, spending metrics, current UTC month and snapshot hash. Execute with
   those exact values:
   ```
   npm run pilot:reset -- --url https://pathway-ai.replit.app --action execute --confirm-production pathway-ai.replit.app --operation OPERATION_ID --snapshot SNAPSHOT_HASH --month YYYY-MM --backup BACKUP_LABEL --backup-taken-at UTC_ISO_TIMESTAMP --restore-verified --rollout-complete --confirm-delete-all-students
   ```
   Use a non-secret backup label, not a URL or filesystem path. All confirmations
   are intentional. Any snapshot/month change requires a new review.

   **Only when the owner explicitly chooses no backup**, omit backup evidence and
   use both waiver flags instead:
   ```
   npm run pilot:reset -- --url https://pathway-ai.replit.app --action execute --confirm-production pathway-ai.replit.app --operation OPERATION_ID --snapshot SNAPSHOT_HASH --month YYYY-MM --no-backup --accept-permanent-loss --rollout-complete --confirm-delete-all-students
   ```
   In that case step 3 still requires a completed rollout, the full drain window
   and zero blockers, but backup creation/verification is deliberately waived.
   The target, snapshot, authorization, transaction and library-preservation
   safeguards are unchanged.
5. Test real registration and cookie authentication while still paused:
   ```
   npm run pilot:reset -- --url https://pathway-ai.replit.app --action verify --confirm-production pathway-ai.replit.app --operation OPERATION_ID
   ```
   This uses a random disposable private phrase and an existing invitation code,
   with AI consent off. It calls normal registration, `/api/auth/session`,
   `/api/today`, `/api/news` and `/api/opportunities`, then deletes only that test
   profile. It prints no credentials or student data and starts no search.
   It checks authenticated screen APIs, **not rendered Today/Explore UI**.
   Failed verification keeps maintenance enabled; inspect the report.
6. Only after successful verification:
   ```
   npm run pilot:reset -- --url https://pathway-ai.replit.app --action resume --confirm-production pathway-ai.replit.app --operation OPERATION_ID
   ```
   Review `status`, then use a normal tester browser for the signed-in visual
   Today/Explore check. Normal work can resume after this explicit command.
   Real registrations after resume naturally increase the student count again.

Before execution, `--action cancel` with the same target and operation restores
normal admission without deleting anything. Cancel cannot undo an executed reset;
recovery requires a separate restorable backup, which cannot be assumed to exist
when waived. Repeating execute for the same operation
returns its receipt instead of resetting again.

## Exactly what changes

The transaction removes students and all personal records (including sessions,
calendars/events, goals/milestones, applications, chats, preferences, picks,
feedback, progress, notifications, audits and search requests). It clears login
attempts and only daily AI counters belonging to the removed student IDs.
It resets **only the current UTC month's** `DiscoveryUsage.runs`, `rechecks` and
`AIUsage["month:YYYY-MM"].count`. Older months and searches/pages/tokens/estimated
cost/embeddings/vector-upsert spending fields remain intact. Original counters
also remain in an owner-only reset receipt in `JobLease`.

Unfinished running discoveries are marked interrupted, with their state, usage
and candidates preserved; pending group work is cleared so it cannot resume
after reset. Completed discovery records are not modified. Opportunity,
SourcePage, KnowledgeChunk, ResearchCandidate, NewsStory and Pinecone vectors are
not deleted or cleaned. No vector API is called. No library cleanup,
reconciliation, provider test or paid search is part of this operation.
