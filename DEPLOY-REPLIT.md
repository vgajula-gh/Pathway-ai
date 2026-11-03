# Publish Pathway AI on Replit

These steps work for a new invitation-only pilot or an update to an existing app. Keep your existing database, sign-in secret and calendar secret. This update adds database fields and tables; it does not reset profiles, applications or usage.

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

   It returns a runId and queues one public coding candidate, with no student data. The job may use **one web research request plus one extraction request**, not one total model call. It does not use a format repair. Shared paid reservations remain counted even on failure.

3. Advance the returned runId. Repeat until `done:true` (normally research, read, extraction/qualification stages). Each call processes one bounded network stage:

   ```sh
   npm run check:scout -- --url https://YOUR-APP.replit.app --mode advance --run JOB_ID
   ```

   An enabled background worker/owner cron may also continue this explicitly authorized job. Read its report with step 6. Live results may be rejected if pages are blocked, old or missing identity/activity facts; the report shows why. This owner job alone does not create student picks or force Pinecone embeddings.

4. Then test one student search below. Do not repeatedly run live tests to work around an error or budget cap.

The existing `npm run check:extraction` remains a configuration-only workspace check. Its `--live` option tests the older synthetic extraction contract outside normal usage counters; prefer the funded Scout test above to trace this rebuild.

## 8. Student acceptance check

1. Use a new **test** profile or your existing test profile; keep real student data. Try a wrong invitation code, then the correct one. Set a sign-in phrase and confirm it opens the same profile on a second device.
2. Choose interests and turn on AI consent in You → Privacy. Open Explore: it offers recommendations/search without automatically spending web calls on entry. The optional preference editor is shared with You; saving preferences reranks SQL choices without starting web research.
3. Choose Search for opportunities / Search for more. Keep Explore open while it reads pages. Stage and candidate/page/qualified counts reflect stored work. Existing cards remain usable. A complete shared library is reused; otherwise only missing coverage is researched.
4. Check up to three Free and three Paid or cost-unconfirmed **in total**. Fewer is valid. Confirm source excerpts, date, cost/format/age warnings and honest Verified versus Needs checking labels. Future announced openings belong in Coming soon, outside the active six. No expired competition should appear.
5. Mark Interested, dismiss with a reason, compare, open the program page and request a prep proposal. Replacements use the catalog without a new paid search. Your schedule changes only after approval.
6. With embeddings configured, let Preparing details become Ask about this program. Check citations and warnings in Buddy and grouped My opportunities answers. Check Pinecone's opportunities namespace; source chunks are public and shared, not student profiles.
7. With a second matching student, verify library reuse without another web run. Test an unknown location/cost, no matches, AI off and a reached cap: ordinary calendars, goals, existing programs and data controls still work. Test the layout and controls on a phone.

## Limits and recovery

DISCOVERY_MONTHLY_BUDGET is an attempt count, **not dollars**. The Scout uses at most three funded research batches per explicit student search; each batch covers at most two focus interests. With a cap of 30, ten students whose searches all need three distinct batches can consume it with their initial searches. Shared catalog reuse can reduce demand; failure attempts still count. One search can include several provider requests for page extraction, so 30 is not a provider-call or dollar limit.

AI_MONTHLY_LIMIT is the separate overall reservation cap (interactive requests plus shared discovery/recheck/preparation work). AI_DAILY_LIMIT applies to interactive requests for each student; shared catalog work does not debit an arbitrary student's daily counter. Hosted provider failures remain counted. UTC calendar months reset the shared usage; personal manual-search allowance uses its rolling 30-day cycle. A failed student search preserves its successful-search slot but does not refund provider attempts.

Raising a cap requires updating the production Secret and republishing. The app rechecks current caps against preserved usage, so an old “limited” result does not keep the button disabled. Starting/resuming web work still requires an explicit student action. Catalog reuse/refills stay free even when a cap is reached. No data reset is needed.

Optional tuning is listed in `.env.example`: max three Scout research calls; eight free-hint/eight paid-or-unknown-hint queued leads (max sixteen combined); 30-day cache; 60-second maximum network stage; output and HTTP limits; six scoring weights totaling 100. Keep defaults first. Do not increase caps to hide missing evidence, unreadable sites or a setup problem. See [the implementation and qualification guide](docs/14-OPPORTUNITY-SCOUT.md).

## Optional notifications and scheduling

Web Push uses a VAPID public/private key pair to identify this website to push services; it is separate from sign-in/calendar encryption and only needed for opted-in notifications. Generate with the existing web-push CLI (`npx web-push generate-vapid-keys`) and set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and a contact VAPID_SUBJECT. Students never enter these values.

An external scheduler can explicitly POST an empty JSON body to `/internal/jobs/run` using the JOBS_SECRET Bearer header. It shares the persistent worker lock and all normal caps with Explore/server timers. Autoscale may sleep; the visible Explore screen can advance queued work without a continuous background process. No raw Secrets belong in a scheduler URL.
