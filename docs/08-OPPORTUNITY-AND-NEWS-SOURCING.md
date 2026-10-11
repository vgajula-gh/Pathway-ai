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

## News for you pipeline
1. **Sources** — a licensed news API or an allow-list of reputable publisher RSS feeds (science agencies, universities, established outlets). Respect each provider's terms.
2. **Daily job** — fetch per topic; keep title, URL, source, publish date.
3. **Filter** — student-appropriate (no graphic content), non-sensational; prefer explainers and discoveries.
4. **Summarize** — Claude writes a one-sentence neutral paraphrase from the article text; never invent facts; keep source + link.
5. **Store** — `NewsStory` with `checkedAt`; keep 30 days; dedupe by URL.
6. **Show** — `GET /api/news` picks newest per student topics; empty topics say so.
