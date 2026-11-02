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
4. Ensure **Create production database** is enabled, then publish. Replit applies the development-to-production schema diff during Publish. The app inserts its sample opportunity and news catalogues at startup if missing; no demo students are created. Never run `db:setup` or `db:sync:replit` against production.
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

Existing local SQLite profiles are not copied to PostgreSQL automatically. The production database starts with the published schema and starter catalogues, but no student profiles. Returning students can link an existing browser profile with their invitation code and enable sign-in from You → Account. After setup, their private phrase opens the same profile on another device. Removing an invitation code blocks further access to that account. Unlinked legacy profiles retain the browser-ID migration fallback; a linked profile requires an account session.

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

## Personal opportunity discovery: publish safely first

This update works with your existing database, sign-in, calendar, AI and notification Secrets. Keep those values. You can publish with `DISCOVERY_ENABLED=false` first: Interested and catalog picks work without a Pinecone account. Students who finish a new profile now see Explore after saving their recovery code; returning students still open their dashboard.

Before publishing, sync the new schema to the **development** Replit database with `npm run db:sync:replit`, review the schema changes in Publish, and keep the production database selected there. Confirm the database target explicitly; a workspace environment label alone does not identify the development database. Do not replace production DATABASE_URL with a development URL. Replit applies the schema diff on Publish; `npm start` keeps the existing no-production-DDL behavior.

### Create a Pinecone index

For the simplest setup, use your existing OpenAI key for embeddings and Pinecone for vector storage:

1. Open [Pinecone](https://app.pinecone.io/), create an account, and create/select a project.
2. In **Database / Indexes**, choose **Create index**. Choose a **serverless dense index for your own vectors** (labels may vary), not an integrated text-embedding index.
3. Give it the name `pathway-opportunities`. Set **dimension 1536** and **metric cosine**. Choose a cloud/region available under your plan. This dimension matches OpenAI `text-embedding-3-small`.
4. Wait until the index says Ready. The app creates/uses the namespace **opportunities** when it first writes vectors. Keep this namespace dedicated to Pathway's public program knowledge.
5. Open Pinecone **API keys**, create a key for this project with index read/write access, and copy it into Replit deployment Secret `PINECONE_API_KEY`. Set `PINECONE_INDEX=pathway-opportunities`.
6. Keep the key private. Students do not need Pinecone accounts or any service API keys. PostgreSQL still stores program text/citations; Pinecone holds public-program vectors/metadata, not student profiles or chats.

Reference: [Pinecone index settings](https://docs.pinecone.io/reference/api/2025-10/control-plane/configure_index). A different embedding model can need a different index dimension. Changing only the secret will not resize an existing index; create the matching index and arrange re-ingestion when changing models. A dimension mismatch turns program questions off with a log message instead of stopping the app.

### Add discovery settings to Replit deployment Secrets

These are **server settings**, even where the value is not confidential. Never prefix keys or JOBS_SECRET with `VITE_`. Keep `AI_DISABLED=false` when you want paid discovery. Keep your existing `LLM_PROVIDER`, provider key and Buddy model (`OPENAI_MODEL` for OpenAI).

| Name | Safe default / what to enter |
| --- | --- |
| `DISCOVERY_ENABLED` | `false`; change to `true` only after the index/settings below are ready. |
| `SEARCH_PROVIDER` | `none`; choose `openai` for your OpenAI account or `anthropic` for Claude search. |
| `SEARCH_MODEL` | Optional. OpenAI defaults to `gpt-4.1-mini`; Claude inherits ANTHROPIC_MODEL. Use a web-search-capable model available in your account. This is separate from Buddy's model. |
| `AI_MODEL_EXTRACTION` | Optional; blank inherits Buddy's model. You can enter the cheaper model already working in your account, such as your existing nano setting if still supported. |
| `EMBEDDING_PROVIDER` | `none`; enter `openai` for the 1536-dimension setup above. Alternatives: pinecone, voyage, ollama. |
| `EMBEDDING_MODEL` | For this setup: `text-embedding-3-small`. Provider defaults are listed below. |
| `EMBEDDING_DIMENSION` | For this setup: `1536`; must match the index. Blank uses the selected provider's default. |
| `VECTOR_STORE` | Local template: `memory`. **Set `pinecone` explicitly in production.** If omitted in production, the app selects pinecone. SQLite always uses memory/cosine. |
| `PINECONE_API_KEY` | Your Pinecone project API key. No default. |
| `PINECONE_INDEX` | `pathway-opportunities`, or the exact index name you created. No default. |
| `VOYAGE_API_KEY` | Only needed if EMBEDDING_PROVIDER=voyage. No default. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Existing provider keys; also used by the corresponding search/embedding adapters. Do not generate another OpenAI key just for this feature unless you want separate project billing. |
| `DISCOVERY_MONTHLY_BUDGET` | `10` shared discovery attempts per UTC month. Start small; `0` prevents new discovery attempts. Not a dollar amount. |
| `DISCOVERY_RECHECKS_PER_MONTH` | `10` separate source re-check attempts per UTC month; `0` pauses these paid re-checks. |
| `DISCOVERY_TRUSTED_DOMAINS` | Optional comma-separated organizer domains you have reviewed, e.g. `official-organization.example`. No protocol/path. Seed domains and education/government sources are already recognized; .org alone is not proof. |
| `JOBS_SECRET` | A **new, separate** random value of at least 32 characters for your scheduled trigger. Generate it as described below. |
| `MANUAL_REFRESHES_PER_MONTH` | `1` per rolling cycle, plus at most one earned interest-change bonus. |
| `FREE_PICKS` / `PAID_PICKS` | `3` each. These are targets; there may be fewer suitable catalog records. |
| `STRETCH_PICKS` | `1`; `0` disables the optional stretch slot. Never invent a stretch item when none qualifies. |
| `REFRESH_INTERVAL_DAYS` | `30`. “Monthly refresh” means a rolling 30-day cycle, not the first day of each calendar month. |

Embedding defaults if you choose another provider: Pinecone `multilingual-e5-large` / 1024 dimensions; Voyage `voyage-3-lite` / 512; local Ollama `nomic-embed-text` / 768 (download that embedding model separately). Those choices require a matching index and their provider configuration. The recommended pilot remains OpenAI embeddings + Pinecone vectors.

Run the random-value command **again** to make JOBS_SECRET; do not reuse or change SIGN_IN_SECRET or CALENDAR_SECRET:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the result into `JOBS_SECRET` in the website deployment and into the scheduled trigger's Secrets. It authorizes background checks only; students never enter it. If you rotate it, update both places together. Missing JOBS_SECRET disables the external endpoint; the in-server timer can still run while the server is awake.

### Schedule the background checks

The app checks for work every minute while running. **Autoscale can sleep**, so add a scheduled HTTP trigger for unattended work. The trigger operates on the published app's database through its protected API; it does not need DATABASE_URL or AI/Pinecone keys.

If your Replit plan offers Scheduled Deployments:

1. Create a separate small **Node.js** Replit app for the trigger, so the main website keeps its Autoscale deployment.
2. In that trigger app's Secrets, add `PATHWAY_URL` = the published website's full HTTPS address (no `/api`), and the same `JOBS_SECRET` you put on the website.
3. Put the following in its `index.js`. Choose `node index.js` as its run command. No extra packages are needed.
4. Publish it as a **Scheduled Deployment** at the cadence available on your plan, ideally every 5 minutes. One invocation handles one queued interest group plus one re-check, so initial discoveries can take several invocations. Run it once manually to check the output.

```js
const site = process.env.PATHWAY_URL;
if (!site?.startsWith('https://') || !process.env.JOBS_SECRET) {
  throw new Error('Add PATHWAY_URL and JOBS_SECRET to this trigger app’s Secrets.');
}
const result = await fetch(new URL('/internal/jobs/run', site), {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.JOBS_SECRET}` },
  signal: AbortSignal.timeout(600000),
});
if (!result.ok) throw new Error(`Pathway background check failed (${result.status}).`);
console.log(await result.json());
```

Save that trigger file as `index.mjs` and use `node index.mjs` if the trigger project does not enable JavaScript modules. Its output contains counts/skipped status, not credentials.

An external cron service is an alternative: configure an HTTPS **POST** to `https://YOUR-PUBLISHED-SITE/internal/jobs/run` and a private request header named **Authorization** with value **Bearer YOUR_JOBS_SECRET**. Leave the body empty. Use a service that supports private headers and up to ten minutes for a request; do not put the secret in the URL. `skipped:true` simply means another worker already holds the lock. Missing/wrong credentials give 401; missing server secret gives 503.

With an always-on Reserved VM, the timer can supply this scheduling itself. Keep Autoscale unless you choose to change hosting. This new endpoint runs **opportunity jobs**, not calendar syncs or push delivery; those existing timed features still need an awake server.

### Confirm it works, then enable discovery

1. Publish once with `DISCOVERY_ENABLED=false`. Sign in and open Explore: Interested and catalog picks should work; the note explains live discovery is unavailable.
2. Add the index/provider settings above to **deployment Secrets**, set DISCOVERY_ENABLED=true and AI_DISABLED=false, then republish. Open Explore; the refresh area should be available. A card gets Ask about this program only after its official pages have been ingested.
3. Finish a new test profile with a topic and state. Catalog picks appear immediately. A queued group shows “Finding more programs for you…”; keep Explore open while the background trigger runs. Source access, queue size, budgets and model responses can mean fewer than six cards.
4. In Pinecone, open your index and the **opportunities** namespace. New `chunk-...` vectors should appear after successful ingestion. Metadata includes opportunityId, chunkId, sourceUrl, pageTitle and checkedAt; it should contain no student name/profile.
5. Use Ask about this program and ask a fact visible on its official page. Confirm clickable sources/check dates. Ask something absent from the pages: Buddy should say the official pages do not say.
6. If discovery is unavailable, Explore keeps **Find new opportunities** visible and explains the blocker. While signed in to the published site in the same browser, open `/api/discovery/status`. Read `unavailable.code` and `unavailable.settings`; those fields contain no API key values. `error: null` only means no background search error was recorded; it does not establish readiness. Use the table below to fix the reported setup, save **Publishing → Adjust settings → Production app secrets**, and republish. Connection checks retry after a minute. In Replit's database viewer, DiscoveryGroup shows queue/error state; DiscoveryRun/DiscoveryUsage show attempts and estimated usage. A fetched site can legitimately prohibit crawling; that result stays unknown/skipped.

| `unavailable.code` | What to check |
|---|---|
| `ai_consent_required` | In Pathway, turn on **You → Privacy → Use AI to help me**. No publishing change needed. |
| `discovery_disabled` | Set `DISCOVERY_ENABLED=true` in the published app. |
| `ai_unavailable` | Set `LLM_PROVIDER=openai`, provide `OPENAI_API_KEY`, and set `AI_DISABLED=false` for the OpenAI setup. `/api/health` should report `aiEnabled:true`; that reports configuration, not a live AI key/model test. |
| `search_not_configured` | For OpenAI, set `SEARCH_PROVIDER=openai` and provide `OPENAI_API_KEY`. Enter the exact values without spaces or quotation marks. |
| `embedding_not_configured` | For this guide, set `EMBEDDING_PROVIDER=openai` and provide `OPENAI_API_KEY`. |
| `vector_not_configured` | Check the variable names listed in `settings`: set `VECTOR_STORE=pinecone`, `PINECONE_API_KEY`, and the exact `PINECONE_INDEX` name. |
| `pinecone_authorization_failed` | Check the Pinecone project/key and permissions, including index describe access. |
| `pinecone_index_not_found` | The index name and API key must belong to the same Pinecone project. |
| `index_dimension_mismatch` | This guide uses a dense 1536-dimension index with `EMBEDDING_MODEL=text-embedding-3-small` and `EMBEDDING_DIMENSION=1536`. |
| `index_metric_mismatch` | Use an index configured for cosine similarity. |
| `vector_unavailable` | Check Pinecone Ready status/service availability or the optional pgvector setup. Try status again after a minute. |

Status checks only inspect configuration and vector-store readiness; they do not send a paid search, extraction or embedding request. Responses and readiness logs contain controlled codes and setting names, never raw provider errors or key values. Health, discovery status and opportunity-list responses also tell browsers not to cache them. No new Secret or database migration is required for these explanations.

### Published-site manual checklist

- [ ] New signup: region optional, recovery-code flow intact, Free/Paid picks appear. Returning phrase sign-in still opens the existing dashboard.
- [ ] Free-only budget: Paid starts collapsed behind Show paid options; unknown fees are clearly labeled. Unverified seed Free text is not presented as confirmed free.
- [ ] Interested: the item moves into the existing tracker; notes/checklist/status controls still work; the empty slot refills in the same bucket if a replacement exists.
- [ ] Not for me: select a reason, confirm it disappears and refills from catalog without consuming a manual refresh.
- [ ] Program questions: answers link to the correct program's official passages and check dates; an absent answer stays unknown; switching to a new general Buddy chat does not keep the old program scope.
- [ ] Checklist: save the program to Interested first, ask about it, then choose Add these requirements to my checklist. Check the preview. Nothing changes before Approve; after approval the result is VERIFIED and previous notes/completed steps remain.
- [ ] Manual refresh: after any pending searches settle, use Find new opportunities; after the allowance is used, the next date is displayed. A meaningful interest change gives only one extra refresh; repeated edits do not mint more.
- [ ] Pinecone: confirm the opportunities namespace contains program vectors with matching dimension and public-only metadata.
- [ ] Fallback: turn DISCOVERY_ENABLED=false and republish; browsing, Interested, refills, calendar, goals and approvals still work. Restore it after checking.
- [ ] Existing data: verify a returning student's applications, phrase, calendar links and notes remain intact after deployment.

Cost planning, caps and provider-price links are in [docs/08-OPPORTUNITY-AND-NEWS-SOURCING.md](docs/08-OPPORTUNITY-AND-NEWS-SOURCING.md). The monthly discovery allowance counts shared runs, not dollars; student Buddy limits are separate. Begin with small run/re-check allowances and monitor your provider dashboards.

### Optional pgvector alternative (developer setup)

Pinecone needs no PostgreSQL extension. For a migration-managed PostgreSQL installation that supports pgvector, `apps/api/prisma/postgresql/optional/knowledge-vector.sql` enables the extension and creates a separate KnowledgeVector table with a 1536-dimension embedding column and HNSW cosine index. Adjust the dimension and EMBEDDING_DIMENSION together before use, apply that SQL explicitly to the intended database, then set VECTOR_STORE=pgvector. The separate vector table keeps the portable Prisma/SQLite text schema independent of extension-only types. This optional DDL is not automatically run by the app. Replit's managed schema-diff workflow may treat manually added tables separately; use Pinecone for the documented Replit pilot. Keep the optional vector table out of unrelated schema cleanup operations. On SQLite, the app automatically uses memory/cosine instead.

Shared discovery and source re-check attempts also reserve one request against the existing **AI_MONTHLY_LIMIT** overall counter. They never consume a student's daily allowance. Their separate discovery/re-check run budgets are additional limits; an exhausted overall AI cap blocks new paid background attempts too.


## LangGraph / LangChain orchestration update

Sync this update and republish using the existing build/run commands. The new server dependencies install through npm ci. Keep your existing OpenAI/Claude/Ollama, Pinecone and scheduling settings: this refactor requires **no new service key, Pinecone index or database migration**. General Buddy and the existing student approval flow continue to work as before. LangGraph orchestrates opportunity discovery and program questions; LangChain handles program documents, scoped retrieval and the prompt/model bridge. The existing daily/monthly limits, background budgets and catalog-only fallback still apply.

## Sample data and intentional demos

Set DEMO_MODE=false in the published app (the default). Startup keeps sourced news and words, and does not create sample opportunities or offer a sample calendar during onboarding. Previously stored sample calendars are hidden from schedule views while their records are retained. DEMO_MODE=true is an explicit local/demo option; sample opportunities and calendar events remain labeled Sample.

To inspect old sample opportunities, run the following from the project root with DATABASE_URL set to the database you intend to inspect:

```sh
npm run cleanup:samples
```

This is a preview. Check the printed database hostname/name or SQLite path; a Replit environment label alone does not establish which database is selected. The command never prints connection credentials. To remove the eligible records after reviewing that target:

```sh
npm run cleanup:samples -- --apply
```

Cleanup removes unused sample opportunity pages, chunks, vectors and derived sample picks. It preserves any opportunity referenced by a saved/application record, feedback, goal or active proposal, including Interested items and their notes/checklists. It does not delete accounts, calendars, events, goals, news or student-authored records. Vector-deletion failures retain the corresponding database records and are reported. The command is idempotent and never runs automatically.

No LangSmith account or key is needed. Hosted workflow tracing is explicitly disabled for student privacy; small stage/status/reason records are available in program-message metadata and DiscoveryRun usage. `npm run demo:workflows` is an optional developer demonstration with synthetic fixtures and no paid provider calls. Live search/Pinecone setup remains the same as above.
