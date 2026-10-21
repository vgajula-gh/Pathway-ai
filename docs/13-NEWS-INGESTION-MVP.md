# News ingestion MVP

Implementation status: code and offline tests implemented; no production job installed and no live stories approved by this change. Automated discovery creates review candidates, not automatic publication. The ordinary student-interest/topic selection and general-story fallback remain unchanged. Empty topics remain explicit.

## Sources and coverage

| Source | Registry ID / feed | Topic | Why / activation requirements |
| --- | --- | --- | --- |
| NASA | `nasa` / `https://www.nasa.gov/feed/` | Space | First-party space/science reporting; [official feed directory](https://www.nasa.gov/rss-feeds/). Validate feed, redirects, article HEAD support, and [usage terms](https://www.nasa.gov/nasa-brand-center/images-and-media/) before enabling. Broad NASA stories require editorial topic review. |
| U.S. National Science Foundation | `nsf` / `https://www.nsf.gov/rss/rss_www_news.xml` | Science | First-party research announcements; [official feed directory](https://www.nsf.gov/rss). Validate current endpoint, terms and attribution before enabling. |

Only these two topics have adapters configured in this first release. The other five topic choices remain available; they may be empty. They are not filled with unrelated or generated stories. Source IDs are opt-in through `NEWS_SOURCE_IDS`; unknown or empty configuration fails clearly. Changing source policy is a code-reviewed registry change, never a URL from a student or model.

Expansion candidates, not implemented sources: [MIT News topic feeds](https://news.mit.edu/rss) for AI/technology, climate, arts, health and sports/fitness; [NIH science feeds](https://www.nidcr.nih.gov/about-us/nidcr-rss-feeds) for health; [Smithsonian feeds](https://insider.si.edu/rssfeeds/) for nature/culture. MIT's [republication terms](https://news.mit.edu/terms-of-use) impose attribution requirements beyond our current card, so those feeds are intentionally not enabled. Sports coverage would need broader permitted publisher or licensed API coverage. No license, permission, comprehensive topic coverage or feed availability is claimed here.

## Implemented pipeline

1. Standalone operator job, not a Buddy tool or unauthenticated HTTP endpoint. It reads only global source config and global news tables; no student data or interest queries leave the server. It works with AI disabled. This is authorized catalog maintenance, not a proposal that modifies a student's records.
2. Exact HTTPS host allow-list; credentials, nonstandard ports and external article hosts rejected. At most two redirects are followed manually; each hop must pass the same exact HTTPS host allow-list. External-host redirects are rejected. The fixed registry must be reviewed before adding hosts. Runtime egress policy should permit only those public publisher hosts and block private networks, including DNS rebinding destinations.
3. RSS 2.0 and Atom with XML validation; DTD/entities declarations rejected. GET requests have 5-second timeouts, 1 MB streamed/decompressed byte limit and XML content-type checks. At most 20 entries per source per run. Overall network budget 240 seconds; no article bodies, images or scripts retrieved. Article HEAD must return success and HTML; 405/external redirects are conservative failures, not assumed verified. No retries inside a run; the scheduler/operator retries failed runs.
4. Publisher title, source identity, article URL and actual publication date normalized. Missing, ambiguous, invalid, future and older-than-30-day dates rejected. Atom `updated` is never substituted for `published`. Headlines become plain text; summaries stay empty. Feed descriptions are used transiently for triage/hash, not copied into summaries or persisted. No LLM, invented facts, full-text scraping or automated paraphrases.
5. Canonical URL removes fragments, trailing slashes and known tracking parameters while retaining semantic query parameters. Stable SHA-256 URL IDs and a unique normalized-headline fingerprint suppress exact/cosmetic title duplicates across publishers and runs. Semantic rewrites/syndicated stories with different titles are not reliably detected; editorial review catches those. A duplicate at a different URL never refreshes the existing article's verification timestamp.
6. `checkedAt` advances only after that article's feed metadata and HEAD check succeed. Feed outages retain existing rows without refreshing them. Broken links revoke visibility immediately. Publication dates never become ingestion dates. Approved unchanged content stays approved; a changed title, URL, publication date, topic or description changes `contentHash` and resets review. Per-row writes are atomic; failures can leave earlier candidates stored, and a retry is idempotent.
7. Every new unflagged item is `pending`; sensitive/sensational keywords make it `blocked`. Both are hidden. Keyword checks are triage, not a guarantee about age suitability, misinformation or linked-page content. A human must read the actual article, check source/title/date/topic, age suitability, neutrality and duplication before approving the current hash. Flags cannot be overridden by the approval command. Linked pages may later change outside our control; no rendered media is included in the card. Report unexpected changes and block the item.
8. Database review operation atomically checks hash, source, freshness and flags, then records reviewer/time/decision in `NewsReview`. Approval and audit roll back together. Operator access is through the deployment console only; protect it with existing host/DB access controls. No new student privileges or admin web UI are introduced.
9. Read-time filtering independently hides samples, unreviewed/blocked items, invalid/unapproved sources, articles older than 30 UTC calendar days, future dates, and articles not successfully rechecked in 72 hours. Thus an unavailable scheduler cannot keep stale stories visible indefinitely. The endpoint excludes operator identities, hashes and moderation fields. `updatedAt` is the newest check among returned stories/top, not an ingestion-success claim. Cards show the source check date.
10. Every ingestion run records start/end/status and bounded per-source counts/errors. A compare-and-set database lease prevents overlapping writers, expires after 15 minutes after a crash, and is released only by its owner. Expired articles are deleted even during source outages. Run/review logs retained 90 days. A crash may leave `running` logs; monitor these, not only successful exits.

## Local setup and review

Use Node 22+ and install from the repository root. Existing `package-lock.json` was refreshed to include the parser and previously missing workspace test dependencies.

```bash
npm ci
npx prisma generate --schema apps/api/prisma/schema.prisma
# Use a development/staging DB and an existing .env (copy .env.example if needed).
npm run db:push --workspace apps/api
```

No historical news fixtures are seeded anymore. Existing sample rows remain hidden and age out. The new schema adds nullable unique `fingerprint`, source/moderation/review fields, and global run/lease/review tables; legacy rows default to pending and are hidden. Back up an existing DB before applying schema changes. SQLite development uses `db push`, matching the rest of this repository. Production Postgres needs a reviewed, provider-specific migration generated/tested in staging and deployed before the new API/job; this change does not claim to supply or apply a production migration. Do not run `db push` against production. This remains part of M-8.

After terms and runtime validation, set `NEWS_SOURCE_IDS=nasa,nsf` in the deployment `.env`. The API and job must point to the same database, with an absolute SQLite path on a persistent volume if using SQLite.

```bash
npm run news:ingest --workspace apps/api -- --dry-run
npm run news:ingest --workspace apps/api
npm run news:review --workspace apps/api -- list
npm run news:review --workspace apps/api -- STORY_ID CURRENT_CONTENT_HASH approved OPERATOR_ID
npm run news:review --workspace apps/api -- STORY_ID CURRENT_CONTENT_HASH blocked OPERATOR_ID
```

Dry run retrieves/normalizes/checks links and reads dedupe state but never writes candidates, leases, logs or pruning. Its `stored` count means "would store". Inspect the JSON counts and source errors; it is not a preview of article text. Review `list` returns up to 100 pending/blocked items; use Prisma Studio on the protected development/staging host for deeper inspection. Approval is an explicit operator action after reading the linked article. The hash prevents accidentally approving an older candidate. Do not approve solely because a keyword check passed.

## Scheduling and deployment

`deploy/news-ingestion.crontab.example` supplies a daily 05:10 UTC cron entry, not an installed schedule. Use a managed cron/worker on the API network with DB access and the same deployed code/schema. An ephemeral GitHub Actions runner with a fresh SQLite file would not update the application's database. Codespaces may suspend and are not reliable production schedulers.

- Install dependencies and Prisma Client during build; the command uses `tsx`, currently a development dependency, so the worker must retain development dependencies or compile and run `dist/jobs/ingest-news.js` with Node and equivalent environment configuration.
- Keep `.env` outside source control. These feeds need no API keys. If licensed API adapters are added, use the secret manager and never pass student profiles or interests.
- Apply the schema first, deploy API and worker, dry-run, run ingestion, review candidates, then install cron. The cron example assumes `flock`, GNU `timeout`, writable log destination and cron support for `CRON_TZ`; adapt on managed schedulers. Run timeout 300 seconds is below the 15-minute lease. Enforce single execution per DB and do not manually start long-running duplicate jobs.
- Exit 0 means all sources returned usable entries (possibly all duplicates); nonzero means failure or partial source failure. Run JSON reports counts for rejected metadata, duplicates, link failures and stored candidates. Alert on nonzero exit, no completed run within 26 hours, stuck running >15 minutes, repeated zero usable entries, review backlog, and topics without fresh approved stories. Restrict logs to operators; they contain no student data.
- Retry transient failures using the same command; no reset or deletion needed. Respect provider rate limits; do not put tight retry loops around errors. After restoring source availability, recheck and re-review any revoked candidate before publishing it.
- Rollback: stop the scheduler; the additive schema can stay in place. Keep read-time freshness protection enabled. Restore backup only if required by the deployment recovery procedure.

## Validation boundaries

Automated tests use fixture HTTP responses plus real disposable SQLite, covering parsing, limits, malicious URLs/XML, dates, safety triage, changed approvals, dedupe, failures, pruning, leases, atomic review/audit and Fastify route personalization/freshness. They do not establish publisher permission, live endpoint compatibility, full article factuality/age suitability, or production scheduler/Postgres behavior. Run the live dry-run from the deployed runtime, validate article samples and publisher terms, then record the results before enabling each source. No production configuration, live approvals or scheduling is performed by this PR.

### Live probes performed October 21, 2026

These dry-runs used a disposable local SQLite database and wrote no stories/reviews/job state. Counts are transient observations, not deployment acceptance.

| Probe | NASA | NSF |
| --- | --- | --- |
| Initial strict redirect rejection | Feed: 10 entries; 10 link failures | Feed: 15 entries; 7 usable, 8 rejected by metadata/freshness rules |
| After bounded allow-listed redirect support | Feed: 10 entries; 4 usable, 6 link failures | Feed request timed out |

The initial NASA probe exposed trailing-slash redirects, which are now handled with host validation on every hop and a regression test. The mixed subsequent network results mean **neither source is certified deployment-ready**. Some live retrieval/normalization/link checks succeeded; reliable connectivity, source terms, topic/content review, production migrations and scheduling still require validation on the target runtime. Do not turn these probes into a claim that new stories are already being served to students.
