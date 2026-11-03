# Publish Pathway AI on Replit

You need a GitHub account, a Replit account with publishing enabled, and optionally an AI provider account. Use this for an invitation-only tester pilot. Give each tester a different, long, random invitation code. Students can create a private sign-in phrase and recovery code to access their profile on another device.

## 1. Import the app

1. Merge the deployment pull request into `main` on GitHub.
2. In Replit, choose **Create App → Import from GitHub** (the labels may vary).
3. Paste your Pathway AI GitHub repository URL and import the `main` branch.

## 2. Use Replit-managed PostgreSQL

Replit provides separate development and production PostgreSQL databases. Do not copy a development connection URL into production secrets. In the Replit workspace, run `npm run db:sync:replit` to apply the app's Prisma schema to the development database. During Publish, enable **Create production database** so Replit creates the production database and supplies its own `DATABASE_URL`.

## 3. Add Secrets

Open **Secrets** (the padlock), and add the following. Also check them in the publishing/deployment settings so they are available to the published app. Never paste secrets into source files or GitHub.

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Replit supplies the production PostgreSQL URL when you create/select the production database. Keep it separate from development. |
| `SIGN_IN_SECRET` | A private, randomly generated value of at least 32 characters. Keep it stable and backed up; never put it in a `VITE_` setting. See below. |
| `ACCESS_CODES` | Different long random codes separated by commas, for example `random-code-for-tester-one,random-code-for-tester-two`. Replace these examples. Codes are case-sensitive; do not include commas within a code. |
| `AI_DAILY_LIMIT` | `20` requests per student per day, or another non-negative whole number. |
| `AI_MONTHLY_LIMIT` | `1000` requests total per month, or your chosen non-negative whole number. Set `0` to stop all new AI requests. |
| `FEEDBACK_URL` | Your feedback form's full `https://...` URL. The Send feedback link appears in You. Omit to hide it. |
| `LLM_PROVIDER` | `anthropic` for Claude or `openai` for OpenAI. |
| `ANTHROPIC_API_KEY` | Your Claude API key if using `anthropic`. |
| `OPENAI_API_KEY` | Your OpenAI API key if using `openai`; also set `OPENAI_MODEL` to a model supported by your account. |
| `AI_DISABLED` | `false` to enable configured AI, or `true` to run without AI. |

For Buddy, only one AI provider key is needed. Missing keys also disable AI. Calendar, opportunities, goals, data export, and the other ordinary features continue to work with AI off or capped. Ollama remains available locally; a hosted Replit app needs a reachable Ollama server if you choose that provider.

Limits count accepted AI feature requests (Buddy, schedule scan, coach, and Today insights), including provider failures. A request may involve several model/tool calls, so these are request caps, not dollar budgets. Days and months reset at midnight UTC. Counters are stored in PostgreSQL, survive restarts, and monthly usage remains counted after a student deletes their profile. The daily counter uses the student ID, so creating another profile starts a separate daily allowance; the shared monthly cap still applies.

## 4. Publish

1. Open **Publish** / **Deployments** and keep the current Autoscale deployment target.
2. The repository's `.replit` sets the build command to `npm ci --include=dev && npm run build` and the run command to `npm start`. Keep these settings.
3. Replit supplies `PORT`; the API listens on `0.0.0.0` and serves both the website and `/api` on that port. If configuring a port manually, use `8787` (the default).
4. Ensure **Create production database** is enabled, then publish. Replit applies the development-to-production schema diff during Publish. With DEMO_MODE=false, startup retains sourced news and does not seed sample opportunities or demo students. Never run `db:setup` or `db:sync:replit` against production.
5. Open the published URL. Check that a wrong code is rejected, enter a valid code, finish setup, then open Today and You. Check Send feedback if configured. Share the URL and each tester's own code privately.

For an update, import/pull the latest `main` and republish. Replit applies schema changes during Publish. On startup failures, inspect deployment logs and confirm the production database was created and access codes are configured. A missing or unreachable production database prevents startup.

## Create the sign-in protection secret

Before publishing this update, add `SIGN_IN_SECRET` in Replit Secrets and in deployment Secrets. In Replit's **Shell**, paste this command to generate a value:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the result into `SIGN_IN_SECRET` and keep a secure backup. This is your app's own secret, not an OpenAI key. Use the same value in all deployment instances. Do not change it during updates: changing it stops existing private phrases and recovery codes from working. Startup refuses to run in production without at least 32 characters. No other new service or account is needed for phrase sign-in.

## Returning students

Students choose a private phrase (at least 12 characters) twice during their first Get started setup, then save the recovery code shown once. Several unrelated words are easier to remember; capitalization and extra spaces do not matter. On a new device they enter **only their private phrase** to open their existing Today dashboard. The tester invitation is needed only to create or link a profile. With a valid remembered session, Pathway opens Today directly. Use **You → Account → Sign out** on shared devices.

Existing students from before phrase sign-in was added should open Pathway in their original browser, choose **Open my existing profile on this browser**, enter their original tester invitation, then go to **You → Account → Enable sign-in**. Their profile, goals and chats stay intact. A name or invitation alone cannot recover an old browser-only profile on a new device.

If a phrase is forgotten, choose **Forgot your phrase?**, enter the saved recovery code, and create a new phrase. Recovery keeps the same profile, signs out other devices, and replaces the recovery code. Save the new code; the old one cannot be reused. Signed-in students can also change their phrase in You → Account. Anyone who has a phrase or recovery code can access that profile, so keep both private. Without a saved recovery code or a signed-in device, account recovery is unavailable.

Sessions persist in PostgreSQL for 30 days and survive Replit restarts/instances. Removing a tester's invitation code also blocks their phrase, recovery and sessions. Raw phrases/recovery codes are never stored or included in data exports. Keep `SIGN_IN_SECRET` separately from database backups. Replit applies production schema changes during Publish; the app does not run production DDL at startup.

## Local development and Codespaces

Keep `.env` with `DATABASE_URL="file:./dev.db"`. Run `npm install`, `npm run db:setup`, and `npm run dev`. `db:setup` uses the SQLite schema and generates the matching Prisma client. On an existing SQLite database, Prisma may warn about the new nullable private-phrase hash unique index. Back up the local database first; if the sign-in and recovery hash columns are new and entirely null, a developer can apply this additive upgrade with `node --env-file=.env node_modules/prisma/build/index.js db push --schema apps/api/prisma/schema.prisma --accept-data-loss`. Do not use that flag to bypass unrelated data-loss warnings. Codespaces keeps this workflow. Leave `ACCESS_CODES` empty to skip the gate locally, or set codes to test it. After running a production build locally, run `npm run db:push --workspace apps/api` to regenerate the SQLite client before local development/tests.

`npm run build` generates the PostgreSQL Prisma client and builds the API and web app. `npm start` requires PostgreSQL and access codes, then serves the production build without a `.env` file. Replit supplies the production database URL and applies schema changes during Publish. The SQLite schema is the data-model source; the build derives the PostgreSQL schema from it. Future model changes must be synced to the Replit development database with `npm run db:sync:replit` before publishing.

Existing local SQLite profiles are not copied to PostgreSQL automatically. The production database starts with the published schema and sourced news, but no student profiles. Returning students can link an existing browser profile with their invitation code and enable sign-in from You → Account. After setup, their private phrase opens the same profile on another device. Removing an invitation code blocks further access to that account. Unlinked legacy profiles retain the browser-ID migration fallback; a linked profile requires an account session.

## Applications tracker upgrade
No new Secrets. Replit applies production schema changes during Publish. SQLite now also has versioned migrations (`prisma migrate deploy --schema apps/api/prisma/schema.prisma` for a new local database); keep db:push for existing local/Codespaces databases without migration history. Save an opportunity in Explore, edit its deadline/steps, check Today → Due soon, then review Plan my prep before approving. Student dates are always labeled as added by you, never source-verified.

## Private calendars and background scheduling
Keep the current **Autoscale** deployment target, as requested. Autoscale may sleep with no visitors, so three-hour calendar syncs and timed nudges are not guaranteed while idle. A Reserved VM would be needed for reliable unattended schedules. Database leases coordinate multiple replicas.
Add `CALENDAR_SECRET` as a deployment Secret: generate it with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` in Replit Shell, copy the result into Secrets, and keep a secure backup. It encrypts private calendar URLs; changing it makes existing links unreadable until re-added. It is separate from API keys. Development uses a local-only fallback. Missing production configuration disables calendar linking with a friendly message, not the rest of the app.
Test with a private Google/Canvas iCal link you control (or an Apple share link after considering its link-access sharing). Save in You → Calendars, check the masked URL and last-sync status, edit/delete an event at the provider, then Sync now. Confirm the mirror updates and cannot be edited in Pathway. Calendar HTTP access depends on the deployment's provider/network permissions. Mirrors cover the rolling previous 30 / next 180 days; unsupported/oversized calendars show an error and keep prior events.

## Installable app and Web Push
1. Use the HTTPS published URL. Installation and push need a secure origin (localhost also works for development). The service worker is built by `npm run build`; Vite development mode does not install the production worker.
2. In Replit Shell, run `npx web-push generate-vapid-keys`. Copy Public Key to deployment Secret `VAPID_PUBLIC_KEY` and Private Key to `VAPID_PRIVATE_KEY`. Set `VAPID_SUBJECT` to a contact URI such as `mailto:you@your-domain.com` (or your HTTPS contact URL). Keep the private key secret and backed up. Changing keys means devices need to unsubscribe and re-enable; subscription ciphertext is protected with the private key. No push service account is needed.
3. Republish using the current Autoscale target. Missing/invalid VAPID configuration leaves notifications unavailable with an explanation; all other features keep working. No permission prompt is shown automatically. Scheduled nudges may not run while Autoscale instances are idle.
4. On iPhone/iPad, open in Safari → Share → Add to Home Screen, then open the installed app (iOS/iPadOS 16.4+ supports installed web-app push). Android/desktop users can choose Install Pathway or their browser's install menu. Platform support varies.
5. In You → Notifications choose Enable on this device and accept browser permission, select a time between 7am and 9pm, and enable Daily nudge. Use Send a test nudge during free time; the test counts as today's one nudge. An accepted provider response is not a guarantee of device delivery. Verify actual delivery on the device.
6. Test pause/resume and Unsubscribe this device. Check class and quiet-hour suppression. At most one reserved attempt per day is deliberate: crashes/provider failures can skip a nudge rather than risk sending twice. An idle/suspended server cannot deliver timed jobs; do not rely on an Autoscale deployment sleeping with no users.
7. For offline testing, install/load once, go offline, and reopen: the public shell loads, while live data asks for a connection. No private API data is cached.

New deployment environment variables for these three features: `CALENDAR_SECRET` (private calendar encryption), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (optional Web Push). No AI key is needed for the tracker, calendar engine, or nudges. Keep existing database/access/provider Secrets.

## Combined sign-in and student-feature upgrade
Keep `SIGN_IN_SECRET` from the sign-in deployment, and add calendar/VAPID Secrets only for those optional features. Replit applies production schema changes during Publish; the app does not run production DDL at startup. New migration-managed SQLite databases include the matching account migration too; existing local databases can continue using db:push. Signing out removes notifications on that device; changing/recovering a phrase turns notifications off on all devices, which must opt in again.

## 5. Enable real opportunity search and Pinecone questions

Add settings **before republishing**. In the main app open **Publishing → Adjust settings → Production app secrets** (labels can vary). Workspace Secrets and published Secrets can differ; check both. Keep existing sign-in and calendar secrets stable. Students supply their own private sign-in phrases, never these server secrets or API keys.

### Pinecone: use the existing matching index

1. Open [Pinecone](https://app.pinecone.io/) and select your project and index. For a new index, choose **serverless, dense, bring your own vectors**, metric **cosine**, name such as `pathway-opportunities`. Choose an available cloud/region. Do not choose an integrated document/text-embedding index for this adapter.
2. Match the embedding dimension. **For your existing 1024-dimensional index:** use `EMBEDDING_PROVIDER=openai`, `EMBEDDING_MODEL=text-embedding-3-small`, `EMBEDDING_DIMENSION=1024`. OpenAI supports shortened dimensions for this model. **For a new default index:** use 1536 in both places. Changing a Secret does not resize an index.
3. Wait until Ready. Copy its exact name into `PINECONE_INDEX` and a project API key with index read/write permission into `PINECONE_API_KEY`. Set `VECTOR_STORE=pinecone` explicitly.
4. The app writes to namespace **opportunities**. Select that namespace when checking records; the default namespace can stay empty. PostgreSQL stores the public page text and citations. Pinecone holds public vectors/metadata, with no student profiles or chats.
5. Keep the current index unless its settings are unsuitable. An empty index is expected before a real official page is verified and ingested. New index/model identity automatically causes preparation for the selected store; it does not delete or migrate your old index. If the dimension/metric is wrong, questions explain the setup issue while verified search results can still work.

References: [Pinecone indexes](https://docs.pinecone.io/guides/index-data/create-an-index), [OpenAI shortened embeddings](https://developers.openai.com/api/docs/guides/embeddings#reducing-embedding-dimensions).

### Add these production settings

| Setting | Safe default / what to enter |
| --- | --- |
| `DEMO_MODE` | `false`. Keep false for real students. |
| `AI_DISABLED` | `false` to enable configured AI; `true` stops all paid AI work. |
| `LLM_PROVIDER`, provider key, Buddy model | Keep your working provider, e.g. `openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`. Claude uses `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`. |
| `DISCOVERY_ENABLED` | Default `false`; set `true` for live opportunity search. |
| `SEARCH_PROVIDER` | Default `none`; set `openai` or `anthropic` with its API key. |
| `SEARCH_MODEL` | A web-search-capable model available in your account. OpenAI code default is `gpt-4.1-mini`; check availability/deprecation before relying on it. Buddy’s nano model is a separate setting and may not support web search. |
| `AI_MODEL_EXTRACTION` | A cheaper JSON-capable model you have tested; blank inherits Buddy’s model. Existing `gpt-5-nano` has reasoning headroom in this adapter, but check current provider availability. |
| `EMBEDDING_PROVIDER` | Default `none`; set `openai` for the setup above. Other adapters: pinecone, voyage, ollama. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` for the setup above. |
| `EMBEDDING_DIMENSION` | `1024` for your existing index; `1536` for a new default OpenAI small index. Must match. |
| `VECTOR_STORE` | Default `memory`; **set `pinecone` in production**. SQLite always uses memory for local development/tests. |
| `PINECONE_API_KEY`, `PINECONE_INDEX` | Your private project key and exact index name. |
| `VOYAGE_API_KEY` | Only if choosing Voyage embeddings. |
| `DISCOVERY_MONTHLY_BUDGET` | `10` public topic-group search attempts per UTC month; `0` prevents new search attempts. Not dollars. |
| `DISCOVERY_RECHECKS_PER_MONTH` | `10` shared source-recheck **and standalone knowledge-preparation** attempts per UTC month. Six missing program ingestions can use six attempts; adjust deliberately. |
| `DISCOVERY_TRUSTED_DOMAINS` | Optional comma-separated official organizer domains you have reviewed; no protocol/path. Education/government and known organizer domains are already recognized; .org alone is insufficient. |
| `JOBS_SECRET` | A separate random value of at least 32 characters for the owner cron trigger. |
| `MANUAL_REFRESHES_PER_MONTH` | `1` successful manual search per rolling cycle, plus one meaningful-interest-change bonus. |
| `FREE_PICKS`, `PAID_PICKS` | `3` each; targets, never guaranteed counts. |
| `STRETCH_PICKS` | `1` maximum eligible outside-interest pick; `0` disables it. |
| `REFRESH_INTERVAL_DAYS` | `30` rolling days. Overall paid budgets reset by UTC calendar month. |

For other embedding providers, defaults are Pinecone `multilingual-e5-large`/1024, Voyage `voyage-3-lite`/512, Ollama `nomic-embed-text`/768. Match the index and provider configuration; students need none of these accounts. No LangSmith key is needed and hosted workflow tracing is disabled.

`/api/health` reports whether Buddy is configured, not whether a live provider request or discovery will succeed. **aiEnabled should be true when you want AI.** There is no `AI_ENABLED` Secret: use `AI_DISABLED=false`, the provider/key/model, the student’s AI consent and the separate discovery settings.

### Sync development schema, then publish

1. Confirm the workspace `DATABASE_URL` is the **development PostgreSQL database** using Replit Database connection settings; a `REPLIT_ENVIRONMENT` label does not identify the target. Keep production credentials out of development schema commands.
2. In Replit Shell run `npm run db:sync:replit`. It applies versioned Prisma migrations to that development database. Existing installations without migration history must be baselined by a developer first; do not reset them or mark unknown migrations applied.
3. Open Publish and review its production schema diff. The two new migrations add active-status fields and search-request state, then chunk store identity. Existing student profiles, sessions, notes and completed steps are retained. Replit applies the production diff during Publish. `npm start` does not run production DDL.
4. Confirm production Secrets and database, build `npm ci --include=dev && npm run build`, run `npm start`, then publish. Keep the main website on Autoscale.

### Schedule background checks

The running server checks jobs every minute. Explore also requests bounded work while visible, so first-use search can progress on Autoscale. Autoscale can sleep; for monthly refresh and source checks without visitors, use an external cron or a **separate Replit Scheduled Deployment**. Do not replace the main website with a scheduled job.

1. Generate `JOBS_SECRET` with the same random-value command used for SIGN_IN_SECRET. Run the generator again for a different secret; do not reuse sign-in/calendar keys.
2. In your scheduler choose an HTTP **POST** to `https://YOUR-PUBLISHED-APP/internal/jobs/run`, JSON body `{}`, header `Authorization: Bearer YOUR_JOBS_SECRET`, every ten minutes. Put the actual secret in the scheduler’s private secret field; do not commit it. Allow up to four minutes; disable automatic retries of failed calls.
3. For a Replit Scheduled Deployment, use a separate small trigger app with Secrets `PUBLISHED_APP_URL` (your website URL) and the same `JOBS_SECRET`. Choose schedule `*/10 * * * *` UTC. Its run command can be:

```sh
curl --fail-with-body --max-time 240 --retry 0 -X POST \
  -H "Authorization: Bearer $JOBS_SECRET" \
  -H 'Content-Type: application/json' -d '{}' \
  "$PUBLISHED_APP_URL/internal/jobs/run"
```

4. Run once. A successful response has `skipped:false` and result counts (`expired`, `refreshed`, `discovered`, `prepared`); `skipped:true` means another worker holds the lock. A wrong/missing key gets 401. Never put JOBS_SECRET in browser code or a `VITE_` variable. A trigger needs no database or AI keys.

Each invocation is bounded and shares a persistent lock/heartbeat with server timers and student requests. Already attempted failed paid work is not automatically replayed. Global limits still apply; a cron call cannot bypass them.

### Confirm search, ingestion and answers

1. Create a **new test profile** with interests, region and AI consent. Do not use Clear data on a real student profile to test a fresh start.
2. Open Explore and choose **Search for opportunities**. Both this button and Search again check the shared library first, then search only missing interests or Free/Paid gaps. Opening Explore alone does not queue a web search. Existing picks stay visible during a search. Interested stays hidden until something is saved. Failed source/provider searches show a real error and Try again; they do not consume the student’s manual allowance.
3. Check Free/Paid cards: organizer/type, future competition deadline, Verified date, honest cost, fit reason, official link. It is valid to find fewer than three, or none, when official pages do not support active/eligible details. The app does not invent replacements.
4. Mark one Interested; its source-backed requirements/deadline appear in the tracker, and a same-bucket catalog replacement costs no AI. Not for me asks why.
5. Watch Preparing details change to Ask about this program. In Pinecone, select **opportunities** and wait briefly for record statistics to update. A shared program is stored once, so another student’s search can reuse records without increasing the count.
6. Ask a requirements question and a deadline/cost question. Each factual excerpt has an official link/check date; structured facts are from SQL. Ask about my opportunities should group programs. Checklist changes appear as a proposal; approve only after reviewing.
7. New web work after the initial search is limited to one completed manual search per rolling month plus one interest-change bonus. Both search buttons reuse a complete active library without web work or allowance debit, including when AI is off or caps are reached. Saving/dismissing also costs no AI. Confirm that Student B can reuse Student A’s discoveries. Paid provider failures do count toward the overall monthly attempt caps.

If there are **zero source pages/chunks**, zero Pinecone records is expected: fix official-page verification first. Ask Replit Agent to inspect safe `DiscoveryRun.usage.failures` fields (`stage`, `code`, public `sourceHost`, `httpStatus`) and the public URL that failed. Robots restrictions, 403 bot blocks, redirects requiring review, missing evidence and JavaScript-only pages are distinct failures. Do not bypass the source’s robots/access rules or delete student data. Source reads use public HTTPS, DNS pinning, canonical www/apex redirects, decompression, time/size limits and controlled errors.

A failed preparation is held for that public source/model/index generation and month instead of spending again on each visit. Recheck/preparation caps may delay details. Fix setup or source issues, then allow a new source/model/index generation or the next monthly attempt; do not repeatedly create indexes as a retry mechanism. Changing an index can incur fresh embeddings and leaves the old index for the owner to retire.

### Production samples and safe cleanup

`DEMO_MODE=false` is the default: startup does not seed sample opportunities; onboarding and You do not offer a sample semester. Previously stored sample calendar events are hidden without deleting them. Real sourced news and words remain. `DEMO_MODE=true` is an intentional local/demo option and labels samples.

To inspect old sample listings, first set `DATABASE_URL` explicitly to the database you intend to maintain, then run from the project root:

```sh
npm run cleanup:samples
```

This is a preview. Check the printed hostname/database or SQLite path; no connection password is printed. After confirming the intended database and reviewing the counts, run:

```sh
npm run cleanup:samples -- --apply
```

The idempotent script removes unused public sample listings/pages/chunks/vectors and derived sample picks. It protects any SavedOpportunity/Interested/application, feedback, goal or active proposal reference and preserves all accounts, calendars, events, notes and student-authored work. Vector failures retain database records and report a failure. It never runs automatically. Keep backups before operational maintenance; do not run db:setup against production.

### Published-site acceptance checklist

- [ ] New onboarding offers no sample semester and creates no sample events/opportunities.
- [ ] Today order is day at a glance → next best step → spark; empty states and seven-day Due soon work.
- [ ] First Explore visit offers Search for opportunities; neither page entry nor status reads queue web search. Both buttons reuse a complete shared library and search only gaps; no fake loading titles.
- [ ] Up to three Free/three Paid, active only, future competition deadlines, Verified dates and honest unknown costs.
- [ ] Interested appears only after saving; checklist/deadline are cited; bucket refills without AI.
- [ ] Not for me asks a reason and refills its bucket without AI.
- [ ] Preparing details changes to Ask, or explains unavailability; single-program answers have citations.
- [ ] Ask about my opportunities groups the student’s programs and cites sources.
- [ ] A different student cannot retrieve or continue another student’s scoped program set.
- [ ] Pinecone has public records in opportunities; another student reuses them.
- [ ] Search again allows one successful manual search plus at most one earned bonus; failed searches leave it available.
- [ ] Wrong access code, AI caps/off state, sign-in on a second device, feedback, export and existing calendars still work.

Cost assumptions, caps and provider-source links: [sourcing and cost guide](docs/08-OPPORTUNITY-AND-NEWS-SOURCING.md). Real provider quality, live official-site access, Pinecone ingestion and phone layout must be checked after publishing; local tests use mock providers and temporary databases.

Foreground work handles a search group or a standalone program preparation per call, keeping slow providers within the web request window. Timer/cron work shares a three-minute run deadline, checked before funding another stage; a final in-flight provider call can finish after that deadline. Paid nodes are never automatically replayed.

## Planning a ten-student pilot and changing caps

The app has no fixed student-profile count. Replit capacity depends on the hosting plan and concurrent usage; the pilot is not a load-test guarantee. ACCESS_CODES is a comma-separated invitation allowlist, not a seat count. Give ten testers ten distinct random codes so each profile records its invitation and access can be revoked separately. One code can register multiple profiles. Students create their own private sign-in phrase for returning on any device; they do not receive SIGN_IN_SECRET or service API keys.

A DISCOVERY_MONTHLY_BUDGET of 30 allows thirty shared topic-group discovery attempts, including failed paid attempts. One student search can need up to five groups; ten students with entirely different five-interest profiles could need fifty runs just for their first searches. Starting with one or two interests and sharing the active catalog can reduce demand. Thirty runs can cover a modest pilot, but does not guarantee thirty full student searches.

AI_MONTHLY_LIMIT is a separate shared cap for interactive requests plus discovery/recheck/preparation reservations. If it remains 1000, ten equally active students have about 100 interactive requests each per month before subtracting shared work. AI_DAILY_LIMIT=20 still caps each student’s daily interactive requests. A feature request can include multiple model calls; these limits are not dollar budgets.

When raising a cap, change the production Secret and republish. The recovery update rechecks both caps against stored current-month usage. Choose Search again to resume previously unfunded work; opening Explore or reading status alone does not start it. It keeps usage records and manual intent; failed paid searches are not automatically replayed. Check `/api/discovery/status` while signed in: `monthlyAllowance.reasons` identifies which cap still blocks searches, and `resetsAt` identifies the shared UTC-month reset. The personal rolling-cycle next date is separate. If the app still reports a cap after this fix, have Replit Agent report the current DiscoveryUsage.runs / DISCOVERY_MONTHLY_BUDGET and AIUsage month count / AI_MONTHLY_LIMIT without printing credentials. This change needs no new schema changes or Secrets. It does not change your configured caps.

## Test extraction without Replit Agent

Use these checks after syncing this code to Replit, before publishing. They run in **Shell**, independently of Agent and your student account. They use the current workspace settings; production Secrets may differ.

1. Open your project and find **Shell** in the tools menu. From the project root, run:

   ```sh
   npm run check:extraction
   ```

   This prints the requested model IDs and checks that extraction has a model and AI is enabled with a provider key. It makes no API request. Fix any reported missing setting in Secrets, restart Run and open a fresh Shell tab. With OpenAI, `AI_MODEL_EXTRACTION` overrides `OPENAI_MODEL`; leaving the override absent is supported.

2. To test the actual configured model, run once:

   ```sh
   npm run check:extraction -- --live
   ```

   This makes one hosted extraction request against clearly synthetic program text and can incur a small provider charge. It does not query or write your database, fetch websites, create a real opportunity or write Pinecone vectors. It is an owner diagnostic outside the app's usage counters; do not run it repeatedly. Hosted retries are disabled. Local Ollama keeps its existing JSON compatibility behavior.

3. A successful `ok: true` live result confirms extraction, local format validation and deterministic evidence verification for that fixture. It does not guarantee that a real website can be fetched or contains enough evidence for verification. If it fails, copy the JSON report: model IDs, failure code and safe field paths are enough to start diagnosis; no key or raw model response is printed.

4. If the check succeeds, test one real search in Preview. Check the correct environment's latest DiscoveryRun records. New records include `usage.models`; old records cannot establish which historical model was used. An empty Pinecone index alone is not proof that search failed: vectors are written after source verification and catalog persistence, in namespace **opportunities**.

OpenAI extraction now sends its exact JSON schema, accepts nullable unknown evidence, requests compact source quotes and allows 4096 output-text tokens (plus nano's existing reasoning headroom). Official-source, grade, date, cost and activity checks remain mandatory. A run where every candidate fails extraction is marked failed; failures keep shared paid reservations counted but leave the student's successful-search allowance intact. No new Secrets, database migration or configured quota changes are required.

## Inspect the published search without Agent or Shell

After merging/syncing this source-reading update and publishing, sign in to the published website and open `/api/discovery/status` in the same browser. Its `diagnostics` section summarizes the current request's stored runs. Opening it does not start another search or consume AI usage, and it can summarize the older failed request you already tested.

- `steps.fetch` / `steps.extract` / `steps.verify` show successful and failed processing steps.
- `programsSaved` counts distinct recorded catalog IDs; it is not a Pinecone vector count.
- `failures` groups every recorded stage/code and safe media type, encoding or field issue. An early unreadable document can no longer hide a later model/configuration failure.
- `models` shows requested model identities when they were recorded. `candidates: null` means those older runs did not record candidate counts.
- `httpAttempts` includes robots requests, redirects and supporting pages, not just successful program reads.

Copy this JSON report if search still fails. No extra search, index recreation or data reset is needed to inspect it. Generic MIME labels no longer reject genuine HTML; known downloads are filtered so HTML results can use the existing reading budget. Actual PDFs/office documents, arbitrary binary data and unsupported pages remain excluded. Eligibility, official evidence, dates, quotas and the three-Free/three-Paid targets are unchanged.

If extraction completes but verification saves nothing, inspect the new failures' `verification` array. Each entry names the required fact and a controlled reason. `gradeMin`/`gradeMax` with `value_not_supported` means the extracted bounds did not match an explicit numeric grade expression; equivalent ordinal wording and contiguous lists are now supported. Generic “high school,” ages and rising grades still do not prove current grade bounds. `source_not_fetched`, `quote_not_found` and `not_stated` identify different evidence gaps.

`officialDomain` with `unreviewed_domain` means the organizer's website still needs owner review. Inspect the public `sourceHost` in that run's internal usage, verify that it is really the organizer's domain, then add only reviewed hosts to the existing `DISCOVERY_TRUSTED_DOMAINS` Secret if appropriate. Do not treat all .org sites as trusted. Expired deadlines and unconfirmed current activity remain excluded. When verification finished, its explanation takes priority over incidental page/processing limits.

This evidence fix needs no database migration, new key, index recreation or quota increase. Sync the merged code and republish. Existing failed searches are not automatically repeated or re-verified: a fresh explicit student search uses the usual remaining allowances and records the new field/reason details. A full recent catalog is still reused without paid work. Older failures do not gain missing diagnostic details retroactively. Local checks cover synthetic sources and intercepted providers, not a successful live production search.
