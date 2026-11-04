# Publish Pathway AI on Replit

For the expiration-only Explore follow-up, there are **no new schema changes, Secrets or resets**. Merge/sync main, run `npm ci --include=dev`, build and publish. Earlier Scout schema additions must already be applied. Open Explore after publish: existing stored rejected links may recover without a new paid search. Only run another search if needed; unconfirmed links should remain visible even if extraction fails. See [the behavior and test checklist](docs/15-EXPLORE-SIMPLIFICATION.md).

These steps work for a new invitation-only pilot or an update to an existing app. Keep your existing database, sign-in secret and calendar secret. The earlier Scout migrations must already be applied. This follow-up adds no database fields/tables and does not reset profiles, applications or paid usage.

## 1. Get the code from GitHub

1. Review and merge this pull request into **main** on GitHub.
2. For a new app, choose **Create App → Import from GitHub** in Replit and import your Pathway repository's main branch.
3. For an existing app, sync/pull main in Replit. Resolve any local Git changes before publishing. Do not discard Replit changes without reviewing them.

## 2. Prepare the database

Replit uses separate development and production PostgreSQL databases. Keep them separate; do not copy the development DATABASE_URL into production.

1. Add/open the PostgreSQL database in the Replit workspace. Its development DATABASE_URL should start with `postgresql://` or `postgres://`.
2. Open **Shell** at the project root. Run `npm ci --include=dev`, then `npm run db:sync:replit`. This applies versioned migrations to **development PostgreSQL**, including the new Scout additions.
3. In **Publishing**, create/select the production PostgreSQL database so Replit supplies the production DATABASE_URL.
4. During Publish, review and apply the **schema additions** from development to production. Keep existing production data. Do not choose reset, overwrite or delete tables. If the preview proposes deletions, stop and inspect the database selection and schema diff.

Replit Publish owns production schema changes. `npm start` intentionally does not run database DDL or migrations. A published app with new code but old tables/columns can return 500 in Today/Explore. Check Publish logs/schema additions first. Do not run `db:setup`, `db:push` or development schema-sync commands against production.

Local development and Codespaces still use SQLite with `npm run db:setup`. Production requires PostgreSQL.

## 3. Add Secrets before publishing

Use **Secrets** in the workspace for Preview/Shell testing. Check **Publishing → deployment/app Secrets** separately for the published app. A Secret present only in Publishing is not automatically available to Shell. Restart Preview/open a fresh Shell after changes; republish for production changes. Never put keys in GitHub, screenshots, browser code or `VITE_*` settings.

| Secret | What to enter |
| --- | --- |
| DATABASE_URL | Replit-managed PostgreSQL URL for that environment; never replace production with development |
| ACCESS_CODES | Different long random invitation codes, separated by commas; case-sensitive |
| SIGN_IN_SECRET | Stable random value of at least 32 characters; keep the existing value on updates |
| CALENDAR_SECRET | Separate stable random value, needed for private linked calendar URLs; keep existing value |
| AI_DISABLED | `false` for AI; `true` disables AI while ordinary features remain usable |
| LLM_PROVIDER | `openai` for your OpenAI key, or `anthropic` for Claude |
| OPENAI_API_KEY | The actual API key from your OpenAI account, not its tracking ID; only needed for OpenAI |
| OPENAI_MODEL | Your Buddy model ID, available to your API account |
| ANTHROPIC_API_KEY / ANTHROPIC_MODEL | Only if choosing Anthropic |
| AI_MODEL_EXTRACTION | Optional separate program-reading model; otherwise inherits Buddy's model |
| DISCOVERY_ENABLED | `true` enables web opportunity research |
| SEARCH_PROVIDER | `openai` or `anthropic`, with that provider's key |
| SEARCH_MODEL | Web-search-capable model; OpenAI currently falls back to `gpt-4.1-mini` when blank |
| AI_MODEL_SCOUT | Optional research-model override; otherwise SEARCH_MODEL/fallback |
| AI_DAILY_LIMIT | Interactive AI requests per student per UTC day; default `20` |
| AI_MONTHLY_LIMIT | Shared monthly interactive requests and background reservations; default `1000` |
| DISCOVERY_MONTHLY_BUDGET | Shared research-batch attempts/month; use your chosen existing cap |
| DISCOVERY_RECHECKS_PER_MONTH | Shared source-recheck and standalone knowledge-preparation attempts; default `10` |
| JOBS_SECRET | Separate random value of at least 32 characters; protects owner jobs and diagnostics |
| FEEDBACK_URL | Full HTTPS feedback-form URL; adds Send feedback in You |
| DEMO_MODE | Keep `false` for the real pilot |

For a straightforward OpenAI Scout test, you can explicitly set `LLM_PROVIDER=openai`, `SEARCH_PROVIDER=openai`, `AI_MODEL_EXTRACTION=gpt-4.1-mini`, `SEARCH_MODEL=gpt-4.1-mini`, and `AI_DISABLED=false`, with your real OPENAI_API_KEY. Confirm current model access/pricing in your provider account. You can keep a different cheaper Buddy OPENAI_MODEL. A model's ability to chat does not prove it supports web search or every source extraction.

To generate each new protection secret, run this in Shell once per secret and save the result privately:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

These owner secrets are not student login phrases. Each student chooses their own phrase during setup and keeps their recovery code. ACCESS_CODES is an invitation allowlist, not a seat count: a code can register multiple profiles. Ten distinct codes help identify ten testers; hosting capacity depends on your Replit plan/concurrency.

### Scout controls for this update

Set these optional controls in **Publishing → deployment/app Secrets** before republishing. Add them separately to workspace Secrets if you also test Preview/Shell. Existing configured count limits are preserved; no limit is automatically raised to 50.

| Setting | Default / meaning |
| --- | --- |
| SCOUT_SOURCE_MODE | `research_evidence`: research details, then a best-effort source check; no separate extraction AI call. `fetch_and_extract` keeps the optional older extraction path |
| SCOUT_MAX_TOOL_CALLS | `5` web tools per research request; maximum `10` |
| SCOUT_MAX_CALLS_PER_SEARCH | `2` funded research batches; maximum `3`. Up to three focus interests per batch covers five interests |
| SCOUT_RESEARCH_TIMEOUT_SECONDS | `150`, maximum `150` |
| SCOUT_EXTRACTION_TIMEOUT_SECONDS | `90`, maximum `90`; optional extraction mode only |
| SCOUT_TIMEOUT_SECONDS | `60` maximum for ordinary source worker stages |
| SCOUT_MAX_OUTPUT_TOKENS | `6000`, maximum `8000`; old explicit overrides remain in effect |
| SCOUT_MAX_HTTP_ATTEMPTS | `40`; includes robots/redirect HTTP attempts |
| SCOUT_REDIRECT_DOMAINS | Optional comma-separated owner-reviewed application hostnames; no protocols/paths. Do not allow all `.org` sites |
| DISCOVERY_MONTHLY_BUDGET | Existing value; default `10` research-batch attempts/month. `50` is an optional pilot setting you can choose after testing |
| DISCOVERY_MONTHLY_SPEND_USD | `25` estimated discovery dollars/month; `0` blocks new funded research |
| SCOUT_WEB_SEARCH_PRICE_USD | `0.025` configured estimate per web tool, not verified vendor pricing |
| SCOUT_INPUT_PRICE_PER_MILLION | `4` configured estimate; use rates conservative enough for all enabled Scout models |
| SCOUT_OUTPUT_PRICE_PER_MILLION | `16` configured estimate; same pricing caveat |
| JOBS_SECRET | Stable owner-only random value, at least `32` characters; already required for diagnostics/jobs |

Keep your actual provider keys/models, AI_DAILY_LIMIT and AI_MONTHLY_LIMIT. A richer research response is optional: malformed details still leave usable links visible. Reported details do not establish eligibility, Free or a Verified badge until actual fetched text supports them. No missing deadline year is guessed. Only confirmed past deadlines hide results; closed/unknown status and profile mismatches remain warnings.

## 4. Optional Pinecone setup

Search/cards work without Pinecone. PostgreSQL stores the actual catalog; Pinecone stores public source vectors for cited program questions.

1. In Pinecone create/select a dense vector index with cosine metric.
2. Choose an embedding provider/model and matching dimension. Example: OpenAI `text-embedding-3-small` uses 1536 by default; it can request 1024 for an existing 1024-dimensional index. Pinecone `multilingual-e5-large` uses 1024. Do not change dimensions on an already populated index without planning re-embedding.
3. Set `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `VECTOR_STORE=pinecone`, `PINECONE_API_KEY`, and `PINECONE_INDEX`. Add the embedding provider key if different. Set these in both environments you intend to test.
4. Keep the index/embedding model/dimension consistent. An indexing setup failure disables program questions, not web research or existing cards.
5. In the Pinecone console select namespace **opportunities**. Vectors appear after a picked/saved public program is prepared. A candidate rejected before storage, an owner test with no student picks, or no embedding setup can leave this namespace empty. One program's public chunks are shared across students.

Memory vectors remain supported for local SQLite/testing. Do not recreate indexes or delete student data merely because a search returned no cards.

## 5. Build and publish

1. Open Publishing/Deployments and keep the Autoscale target.
2. Build command: `npm ci --include=dev && npm run build`. Run command: `npm start`. Both are set in `.replit`.
3. Replit supplies PORT. The API listens on `0.0.0.0` and serves the API and built website from that one port (default 8787).
4. Confirm production Secrets and apply the reviewed database additions, then Publish. Startup does not reset or seed sample opportunities with DEMO_MODE=false.
5. Open `/api/health` on your published URL. For enabled OpenAI, expect `aiEnabled:true` and `provider:"openai"`. This checks Buddy configuration, not live web search or Pinecone.
6. Sign in and open Today/Explore. They should load without a 500. If they fail, check Publishing logs for the exact error; missing columns indicate the production schema update was not applied.

## 6. Trace a search without starting another search

While signed in, open `/api/discovery/status` on the same published domain. It reports current stage, counts, safe failure codes, requested models, cap reasons and reset date. Reading it makes no provider call. It does not expose keys or another student's data.

For the owner report, put the **same JOBS_SECRET** in Shell's Secrets and Publishing Secrets. Open a fresh Shell, then run:

```sh
npm run check:scout -- --url https://YOUR-APP.replit.app
```

This reads configuration presence, public catalog/source/chunk counts and the latest five Scout runs: searched names/URLs, source outcomes, all qualification reasons, recorded tokens, durations and estimated cost. It does not spend AI/search allowance. To inspect one run's fetched public text, passage evidence and raw extracted assertions:

```sh
npm run check:scout -- --url https://YOUR-APP.replit.app --run JOB_ID
```

Do not paste JOBS_SECRET into the URL or chat. The command sends it only as an Authorization header. Reports contain public program content; they do not contain student names, private project text, schedules or Secret values. Estimated dollar cost is a rough estimate, not a billing ceiling/invoice; consult your provider billing dashboard.

## 7. Small owner test before inviting students

1. Check setup without provider work:

   ```sh
   npm run check:scout -- --url https://YOUR-APP.replit.app --mode configuration
   npm run check:scout -- --url https://YOUR-APP.replit.app --mode fixture
   ```

   The fixture is synthetic and makes no AI/network source request or catalog write. A pass confirms the code's reader/evidence/qualification path, not live search quality.

2. To authorize one small real test under your existing shared caps:

   ```sh
   npm run check:scout -- --url https://YOUR-APP.replit.app --mode live
   ```

   It returns a runId and queues one public coding candidate, with no student data. Default evidence-first mode uses **one research API request, up to five web tools, a page check and zero extraction AI calls**. Optional fetch-and-extract mode can also make one extraction request. This owner test performs no format repair. Normal attempt/AI/estimated-spend caps apply, including failures.

3. Advance the returned runId. Repeat until `done:true` (normally research, then page confirmation; optional extraction adds another stage). Each call processes one bounded network stage:

   ```sh
   npm run check:scout -- --url https://YOUR-APP.replit.app --mode advance --run JOB_ID
   ```

   An enabled background worker/owner cron may also continue this explicitly authorized job. Read its report with step 6. Blocked/unreadable pages retain an unconfirmed link; a confirmed past deadline is hidden. No usable URLs means a real failure. The report shows each candidate outcome, fetch reason, actual observed tools/tokens and estimated cost. This owner job alone does not create student picks or force Pinecone embeddings.

4. Then test one student search below. Do not repeatedly run live tests to work around an error or budget cap.

The existing `npm run check:extraction` remains a configuration-only workspace check. Its `--live` option tests the older synthetic extraction contract outside normal usage counters; prefer the funded Scout test above to trace this rebuild.

## 8. Student acceptance check

1. Use a new **test** profile or your existing test profile; keep real student data. Try a wrong invitation code, then the correct one. Set a sign-in phrase and confirm it opens the same profile on a second device.
2. Choose interests and turn on AI consent in You → Privacy. Open Explore: it offers recommendations/search without automatically spending web calls on entry. The optional preference editor is shared with You; saving preferences reranks SQL choices without starting web research.
3. Choose Search for opportunities / Search for more. Keep Explore open while it reads pages. Stage and candidate/page/qualified counts reflect stored work. Existing cards remain usable. A complete shared library is reused; otherwise only missing coverage is researched.
4. Check up to five Free and five Paid or cost-unconfirmed options, ranked by fit. Additional stored links should refill these groups after saving or dismissing an option without a new paid search. Fewer confirmed Free options is valid. Both groups are expanded. Check actual source excerpts and reported-versus-confirmed details; future openings/closed applications remain visible with warnings. Confirmed past deadlines should not appear in discovery.
5. Mark Interested, dismiss with a reason, compare, open the program page and request a prep proposal. Replacements use the catalog without a new paid search. Your schedule changes only after approval.
6. With embeddings configured, let Preparing details become Ask about this program. Check citations and warnings in Buddy and grouped My opportunities answers. Check Pinecone's opportunities namespace; source chunks are public and shared, not student profiles.
7. With a second matching student, verify library reuse without another web run. Test an unknown location/cost, no matches, AI off and a reached cap: ordinary calendars, goals, existing programs and data controls still work. Test the layout and controls on a phone.

## Limits and recovery

DISCOVERY_MONTHLY_BUDGET counts research-batch attempts, **not dollars, students or individual web-tool calls**. Default two batches can cover five interests; with a cap of 30, ten students needing two fresh batches each could use 20 attempts before additional searches/retries. Shared reuse can reduce demand. Paid failures still count. Existing configured limits remain in effect.

AI_MONTHLY_LIMIT separately caps overall interactive/shared reservations; AI_DAILY_LIMIT caps each student's interactive requests. Shared jobs do not debit an arbitrary student's daily counter. UTC calendar months reset shared usage; the student successful-search cycle is rolling 30 days.

A failed or empty search preserves the student's successful-search slot. Earlier empty-result charges are restored once with an audit event; provider usage is not refunded or deleted. Explicit retry is available after one hour, with at most three unsuccessful attempts per shared interest group per UTC day. No timer automatically repeats a failed paid call. Existing results and free library reuse remain available.

DISCOVERY_MONTHLY_SPEND_USD adds an **estimated discovery spending cap**, default $25. A transaction holds estimated funds before funding each run, so concurrent requests cannot all claim the same balance. Completion reconciles the hold using observed tool calls/tokens; missing usage retains conservative estimates. Historical estimated spend initializes the balance. The owner report shows spent-plus-held estimates and configured prices. Raising the cap/republishing rechecks the preserved balance; no reset is required.

At defaults, up to two research requests × five web tools × the configured $0.025 = **$0.25 for tools, plus tokens and any one format repair**. Default evidence-first reservation is approximately $0.5506 per run, including possible repair, with unused estimated funds released at settlement. Those rates and input allowances are estimates, not current provider prices or a guarantee of actual charges. Rechecks, embeddings, Buddy and hosting have separate costs. Set spending controls/alerts in your OpenAI project/account too; confirm whether your provider's budget setting actually blocks requests or only sends alerts.

This update requires no new database migration or data reset. For an existing app with earlier missing-column errors, first confirm the original Scout migrations have been applied through Publish. Keep Explore open to advance work or use the existing owner scheduler. The API and development proxy allow three minutes for a hosted-provider request, retaining the longer local Ollama timeout. Longer SDK timeouts cannot guarantee that a hosting/proxy connection will stay open; persisted stages retain completed results without automatically replaying uncertain paid work.

## Optional notifications and scheduling

Web Push uses a VAPID public/private key pair to identify this website to push services; it is separate from sign-in/calendar encryption and only needed for opted-in notifications. Generate with the existing web-push CLI (`npx web-push generate-vapid-keys`) and set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and a contact VAPID_SUBJECT. Students never enter these values.

An external scheduler can explicitly POST an empty JSON body to `/internal/jobs/run` using the JOBS_SECRET Bearer header. It shares the persistent worker lock and all normal caps with Explore/server timers. Autoscale may sleep; the visible Explore screen can advance queued work without a continuous background process. No raw Secrets belong in a scheduler URL.

### If research reports HTTP400 or invalid_schema

Use the research compatibility update before changing models or raising limits. The repair schema no longer sends unsupported `format: uri`; full server HTTPS validation is retained. This patch needs no new database migration or Secret. Sync/publish the code, then make one controlled search using the normal allowance. New diagnostics identify `operation` (research or repair), safe rejected `providerParam`/`providerCode`, and specific schema fields. Existing failed rows cannot retroactively gain those details. A new successful local test does not prove a live provider request succeeded.

## Timeline deletion, word practice and live news

After merging/syncing, republish normally. These additions need no new Secrets, database migration or reset.

- In Today or Week, use the small minus on an event you created, review the confirmation and delete it. Recurring events remove the entire series; linked calendars remain read-only.
- In Today's spark, Next word offers more vocabulary; Today’s word returns to the daily item. The built-in practice set has 36 words and uses no AI allowance.
- Click Refresh news to load real publisher articles for the selected topics. Next story browses them. The news sheet also offers Refresh news. No news API key is required. The app reads public NASA, BBC News/BBC Sport and ScienceDaily RSS/Atom feeds; your hosting environment must be able to reach their HTTPS endpoints. Repeated refreshes reuse a shared 15-minute cache; a failed source waits one minute before another fetch.
- Sample news is hidden outside demo mode. If the real library is empty initially, click Refresh news. Unavailable publishers produce a clear message and preserve existing real articles; the app does not generate replacement headlines.
- For a deployed check, sign in, choose topics, click Refresh news, then inspect the browser Network response for `POST /api/news/refresh`. Its `refresh` object reports public feed IDs, refreshed/cached/failed states and controlled reasons. `saved` counts stored/upserted articles and may include existing ones. `GET /api/news` only reads the library and never starts a refresh. Local fixture tests verify behavior but cannot establish live publisher connectivity on Replit.
