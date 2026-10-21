# 08 · Opportunity & News Sourcing *(proposed)*

Today the catalog is a **curated sample** (`apps/api/src/data/opportunities.ts`) with `sourceCheckedAt = null` and `deadline = null`, so every card says "not verified for this year". This keeps the demo honest.

## Target pipeline
1. **Sources** — an allow-list of official program pages, school/district feeds, and partner APIs. No scraping of sites that prohibit it.
2. **Fetch** — scheduled job retrieves pages; stores raw snapshot + fetch time.
3. **Extract** — Claude with a strict JSON schema pulls: title, organizer, URL, category, eligibility (grades/age/location/citizenship), dates, application deadline, cost, format, commitment. Unknown → null.
4. **Normalize & dedupe** — canonical organizer + title + season.
5. **Verify** — rules: URL resolves, deadline in the future, eligibility fields present; set `sourceCheckedAt`. Low confidence → human review queue.
6. **Re-check** — weekly for saved/active listings; mark stale after 30 days; expired → hidden from recommendations.
7. **Feedback** — "Not for me", "Link broken", "Info wrong" signals feed quality.

## Display rules
Show verified only with source + check date. Otherwise "Not verified — confirm on the official site". Never invent deadlines or acceptance claims.

## News for you pipeline (MVP implemented)

See [News ingestion MVP](13-NEWS-INGESTION-MVP.md) for source evidence, exact rules, operator commands, scheduling, deployment and live-validation limits.

The standalone job retrieves opt-in official NASA/NSF RSS feeds, normalizes actual publisher metadata, deduplicates canonical URLs/headlines, verifies article links and stores review candidates. New or changed stories require a hash-bound human review; keyword triage blocks obvious sensitive/sensational content. No article text or AI summary is generated. Summarization remains deferred.

News is retained for 30 days and hidden after 72 hours without a successful source/link recheck, independently of the job. Only reviewed, sourced, fresh non-sample stories enter the unchanged personalized topic selector. Five topics currently have no adapter and can remain empty. Production source terms, endpoint checks, review operations and cron activation remain deployment work; there is no promise of daily publication per topic.
