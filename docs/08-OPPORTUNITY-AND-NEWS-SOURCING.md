# 08 · Opportunity & News Sourcing

## Implemented shared opportunity pipeline

The pipeline runs as a bounded LangGraph state machine, with LangChain document/retriever/runnable components. Explore draws up to three Free and three Paid picks from a shared catalog. Starter records remain unverified: old Free text does not count as current official cost evidence. Missing suitable records leave fewer picks, never invented substitutes. One eligible non-fee-flag pick outside the stated interests receives a stretch badge when available. Types and time commitments are balanced within buckets. Interested/dismissed records are excluded; catalog replacements use no AI calls.

1. **Group:** normalize up to five topics independently with grade band 9–10/11–12 and optional state/virtual/US scope. Students with the same group reuse discovery. Queries contain only topic, grade band, broad region, bucket and current year, never names, private goals, schedules or student IDs.
2. **Queue and budget:** queue only when a bucket lacks enough good eligible catalog matches. A group is attempted at most once per 30 days, including failed/interrupted attempts. Persistent UTC-month reservations default to ten discovery attempts and ten separate source re-checks. These count attempts, not successes or dollars.
3. **Search:** OpenAI Responses web-search preview or Claude web search behind adapters. At most two search requests, ten cited candidate URLs and five extraction calls per run. Search-model access is independent of Buddy's model.
4. **Fetch:** public HTTPS only; reject credentials, alternate ports, private IPs and cross-origin redirects. Validate destinations and pin DNS. Respect robots.txt; unavailable rules other than 404 fail closed. Fifteen-second timeout, 1 MiB response, official page plus up to three same-origin rules/FAQ/eligibility/fees links. At most twenty HTTP requests including robots and redirects. Inaccessible, prohibited or JavaScript-only pages may be skipped. Store readable text, title, URL, content hash and timestamp, with 18,000 readable characters/page maximum.
5. **Extract:** separate AI_MODEL_EXTRACTION, strict nullable JSON and verbatim page evidence for each field. Unknown cost stays unknown. Literal names/notes/array entries must occur in supporting quotes. Code checks grade ranges, minimum ages, real future dates and explicit free participation. Free resources or a free application alone do not prove free participation.
6. **Verify:** known seed domains, owner-reviewed DISCOVERY_TRUSTED_DOMAINS and education/government sources establish organizer source identity. A .org suffix alone proves nothing. Verified requires known source plus evidenced grades, format, cost and a current deadline. Other usable findings are new_find. Unknown grade/age/location requirements remain checks. Unestablished organizers with unknown fees or a stated USD fee of at least $500 get feeFlag and cannot be stretch picks. Verification is a source/fact check, not an endorsement or admissions prediction.
7. **Store:** dedupe canonical official domain + normalized name, preserve existing program IDs, record discoveredFor group keys. Snapshots/chunks are public and shared. Extracted text has no action tools or authority to instruct the server.
8. **Ingest/retrieve:** LangChain Documents and a word-counting CharacterTextSplitter preserve the existing approximately 500-word chunks with 50-word overlap; batches of up to twenty chunks, four embedding calls and one hundred vector writes/run. PostgreSQL owns text/citations; Pinecone owns vectors in namespace opportunities. The program-bound LangChain BaseRetriever applies keyword reranking to dense top ten results; the top five scoped database passages are returned, only when their content hashes still match the current source snapshots. Removed source pages retire their chunks/vectors. The cosine index uses this dense-plus-keyword fallback. Memory/cosine on SQLite and optional pgvector implement the same interface.
9. **Re-check:** monthly and once as a known deadline enters its seven-day window; one bounded re-check/invocation. Changed/unreachable pages invalidate prior verification. Confirmed changed facts are extracted and re-embedded; unchanged snapshots refresh check dates without paid extraction/embedding. Re-check identity must match the existing program. Expiry removes recommendations, preserves applications/pinned deadlines, and refills from catalog. Monthly orphan reconciliation is bounded to one hundred pages of vector IDs.
10. **Refresh:** rolling 30-day cycles, one manual refresh plus at most one meaningful-interest-change bonus. Repeated toggles do not earn more. Automatic selection slightly favors existing picks and never changes Interested applications. Dismissal reasons down-rank high commitments/paid records on the next refresh. A persistent lease/heartbeat coordinates timer and owner cron, with 25 due students and one group per invocation.

## Graceful fallback

DISCOVERY_ENABLED defaults false. Missing AI/search/embedding/vector configuration or dimension mismatch hides live refresh/program questions and shows a catalog note. AI_DISABLED disables paid background work too. Browsing, Interested, same-bucket refills and approval remain available. Missing official facts never become fabricated fees, eligibility or deadlines. Student-local dates drive eligibility; global catalog expiry waits until the deadline date has passed everywhere (UTC−12).

## Cost planning (checked 2026-11-02)

Catalog selection/refill/refresh costs **$0 in AI calls**. One refresh can queue up to five topic-group runs; coverage, shared cooldown and the monthly allowance often reduce that number.

Illustrative OpenAI setup: the existing GPT-5 nano extraction setting, GPT-4.1 mini search and text-embedding-3-small. Published standard input/output rates per million tokens are $0.05/$0.40 for nano and $0.40/$1.60 for mini; small embeddings cost $0.02/million. Non-reasoning web-search preview costs $0.025/call. Under the caps, plan approximately **$0.05–$0.10 per discovery run**, **$0–$0.50 per student refresh** for zero to five new groups, and usually under $0.03 for one no-search re-check with this setup. Pinecone plan/storage/operations, Replit hosting, student Buddy conversations and account-specific pricing are additional. Check model availability/retirement in your account and select available replacements through the separate model settings.

Sources: [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [nano](https://developers.openai.com/api/docs/models/gpt-5-nano), [mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [embeddings](https://developers.openai.com/api/docs/models/text-embedding-3-small). Re-check rates before enabling paid discovery.

DiscoveryRun/DiscoveryUsage record attempts, searches, HTTP fetches, embedding calls, vector writes, estimated tokens and a simple planning cost: $0.03/search + $4/million estimated tokens + $0.001/embedding call + $0.00001/vector write. This heuristic is **not** your provider invoice or a guaranteed dollar ceiling. Extraction token estimates reserve completion/reasoning headroom; interrupted runs may lack final usage. Request counts are bounded, and discovery/extraction/embedding adapters do not automatically retry. Suspend paid background work with DISCOVERY_ENABLED=false, or set both run budgets to zero. Other providers/models can cost more than this illustration.

## News for you pipeline (still proposed)

News remains a sourced starter catalog; this opportunity feature does not implement live news ingestion.

1. Use a licensed news API or reputable publisher RSS feeds, respecting terms.
2. Fetch daily by topic, retaining title, URL, publisher and publish date.
3. Prefer student-appropriate, non-sensational explainers and discoveries.
4. Summarize from article text only, without inventing facts, retaining the source link.
5. Store NewsStory with checkedAt, keep 30 days and dedupe URLs.
6. GET /api/news uses the student's chosen topics; empty results remain honest.

Shared discovery and source re-check attempts also reserve one request against the existing **AI_MONTHLY_LIMIT** overall counter. They never consume a student's daily allowance. Their separate discovery/re-check run budgets are additional limits; an exhausted overall AI cap blocks new paid background attempts too.


LangGraph controls the discovery stage/skip transitions and the read-only retrieve/draft/verify/refine loop for program answers. It does not decide facts, spend outside RunBudget or execute student changes. Fixed local stage records make runs inspectable; hosted traces, checkpoint replay and automatic paid retries are not enabled. Existing model settings and cost/request caps remain in effect.
