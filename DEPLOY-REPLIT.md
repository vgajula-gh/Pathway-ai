# Publish Pathway AI on Replit

You need a GitHub account, a Replit account with publishing enabled, and optionally an AI provider account. Use this for an invitation-only tester pilot. Access codes are invitation secrets: give each tester a different, long, random code and keep it private. Students choose a private sign-in phrase during setup; they use that phrase alone to open their profile on another device.

## 1. Import the app

1. Merge the deployment pull request into `main` on GitHub.
2. In Replit, choose **Create App → Import from GitHub** (the labels may vary).
3. Paste your Pathway AI GitHub repository URL and import the `main` branch.

## 2. Add PostgreSQL

1. Open Replit's **Database** tool and create a PostgreSQL database.
2. Copy its connection URL. It begins with `postgres://` or `postgresql://`.
3. Make sure the published app has access to this same database. Use Replit's production database option if offered, and use its production URL in deployment Secrets.

## 3. Add Secrets

Open **Secrets** (the padlock), and add the following. Also check them in the publishing/deployment settings so they are available to the published app. Never paste secrets into source files or GitHub.

| Name | Value |
| --- | --- |
| `DATABASE_URL` | The PostgreSQL connection URL from step 2, including any SSL options. |
| `SIGN_IN_SECRET` | A private, randomly generated value of at least 32 characters. Keep it stable and backed up; never put it in a `VITE_` setting. See below. |
| `ACCESS_CODES` | Different long random codes separated by commas, for example `random-code-for-tester-one,random-code-for-tester-two`. Replace these examples. Codes are case-sensitive; do not include commas within a code. |
| `AI_DAILY_LIMIT` | `20` requests per student per day, or another non-negative whole number. |
| `AI_MONTHLY_LIMIT` | `1000` requests total per month, or your chosen non-negative whole number. Set `0` to stop all new AI requests. |
| `FEEDBACK_URL` | Your feedback form's full `https://...` URL. The Send feedback link appears in You. Omit to hide it. |
| `LLM_PROVIDER` | `anthropic` for Claude or `openai` for OpenAI. |
| `ANTHROPIC_API_KEY` | Your Claude API key if using `anthropic`. |
| `OPENAI_API_KEY` | Your OpenAI API key if using `openai`; also set `OPENAI_MODEL` to a model supported by your account. |
| `AI_DISABLED` | `false` to enable configured AI, or `true` to run without AI. |

Only one provider key is needed. Missing keys also disable AI. Calendar, opportunities, goals, data export, and the other ordinary features continue to work with AI off or capped. Ollama remains available locally; a hosted Replit app needs a reachable Ollama server if you choose that provider.

Limits count accepted AI feature requests (Buddy, schedule scan, coach, and Today insights), including provider failures. A request may involve several model/tool calls, so these are request caps, not dollar budgets. Days and months reset at midnight UTC. Counters are stored in PostgreSQL, survive restarts, and monthly usage remains counted after a student deletes their profile. The daily counter uses the student ID, so creating another profile starts a separate daily allowance; the shared monthly cap still applies.

## 4. Publish

1. Open **Publish** / **Deployments**, and choose a Reserved VM web deployment (always running).
2. The repository's `.replit` sets the build command to `npm ci --include=dev && npm run build` and the run command to `npm start`. Keep these settings.
3. Replit supplies `PORT`; the API listens on `0.0.0.0` and serves both the website and `/api` on that port. If configuring a port manually, use `8787` (the default).
4. Publish and wait for the build and startup to finish. Startup automatically runs versioned Prisma PostgreSQL migrations before accepting traffic. The existing sample opportunity and sourced news catalogues are inserted if missing, without overwriting existing records; no demo students are created. No manual database commands or seed are required. Never use `db:setup` on the production database.
5. Open the published URL. Check that a wrong code is rejected, enter a valid code, finish setup, then open Today and You. Check Send feedback if configured. Share the URL and each tester's own code privately.

For an update, import/pull the latest `main` and republish. Back up the database before schema upgrades. Do not delete migration files. On startup failures, inspect deployment logs: confirm the database URL, database availability, and non-empty access codes. A database migration failure stops startup rather than serving a broken schema.

## Create the sign-in protection secret

Before publishing this update, add `SIGN_IN_SECRET` in Replit Secrets and in deployment Secrets. In Replit's **Shell**, paste this command to generate a value:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the result into `SIGN_IN_SECRET` and keep a secure backup. This is your app's own secret, not an OpenAI key. Use the same value in all deployment instances. Do not change it during updates: changing it stops existing private phrases and recovery codes from working. Startup refuses to run in production without at least 32 characters. No other new service or account is needed.

## Returning students

Students choose a private phrase (at least 12 characters) twice during their first Get started setup, then save the recovery code shown once. Several unrelated words are easier to remember; capitalization and extra spaces do not matter. On a new device they enter **only their private phrase** to open their existing Today dashboard. The tester invitation is needed only to create or link a profile. With a valid remembered session, Pathway opens Today directly. Use **You → Account → Sign out** on shared devices.

Existing students from before phrase sign-in was added should open Pathway in their original browser, choose **Open my existing profile on this browser**, enter their original tester invitation, then go to **You → Account → Enable sign-in**. Their profile, goals and chats stay intact. A name or invitation alone cannot recover an old browser-only profile on a new device.

If a phrase is forgotten, choose **Forgot your phrase?**, enter the saved recovery code, and create a new phrase. Recovery keeps the same profile, signs out other devices, and replaces the recovery code. Save the new code; the old one cannot be reused. Signed-in students can also change their phrase in You → Account. Anyone who has a phrase or recovery code can access that profile, so keep both private. Without a saved recovery code or a signed-in device, account recovery is unavailable.

Startup applies an additive PostgreSQL migration. Sessions persist in PostgreSQL for 30 days and survive Replit restarts/instances. Removing a tester's invitation code also blocks their phrase, recovery and sessions. Raw phrases/recovery codes are never stored or included in data exports. Keep `SIGN_IN_SECRET` separately from database backups.

## Local development and Codespaces

Keep `.env` with `DATABASE_URL="file:./dev.db"`. Run `npm install`, `npm run db:setup`, and `npm run dev`. `db:setup` uses the SQLite schema and generates the matching Prisma client. On an existing SQLite database, Prisma may warn about the new nullable private-phrase hash unique index. Back up the local database first; if the sign-in and recovery hash columns are new and entirely null, a developer can apply this additive upgrade with `node --env-file=.env node_modules/prisma/build/index.js db push --schema apps/api/prisma/schema.prisma --accept-data-loss`. Do not use that flag to bypass unrelated data-loss warnings. Codespaces keeps this workflow. Leave `ACCESS_CODES` empty to skip the gate locally, or set codes to test it. After running a production build locally, run `npm run db:push --workspace apps/api` to regenerate the SQLite client before local development/tests.

`npm run build` generates the PostgreSQL Prisma client and builds the API and web app. `npm start` requires PostgreSQL and access codes, runs migrations, and serves the production build without a `.env` file. Its environment comes from Replit Secrets. The SQLite schema is the data-model source; the build derives the PostgreSQL schema from it. Future model changes must include a new PostgreSQL migration.

Existing local SQLite profiles are not copied to PostgreSQL automatically. The pilot database starts empty. Returning testers sign in using their private phrase; removing a code revokes its API access. Browser sessions retain the access code only for that tab's session. Unlinked legacy profiles retain the browser-ID migration fallback. Linked profiles require an account session, and the browser-stored ID cannot bypass sign-in.

## Applications tracker upgrade
No new Secrets. Startup applies the PostgreSQL applications migration automatically. SQLite now also has versioned migrations (`prisma migrate deploy --schema apps/api/prisma/schema.prisma` for a new local database); keep db:push for existing local/Codespaces databases without migration history. Save an opportunity in Explore, edit its deadline/steps, check Today → Due soon, then review Plan my prep before approving. Student dates are always labeled as added by you, never source-verified.

## Private calendars and background scheduling
Choose a **Reserved VM (always running)** deployment for scheduled calendars and notifications; the repository now sets `deploymentTarget = "vm"`. Autoscale deployments may sleep with no visitors and cannot guarantee three-hour syncs or timed nudges. Database leases coordinate multiple always-on replicas.
Add `CALENDAR_SECRET` as a deployment Secret: generate it with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` in Replit Shell, copy the result into Secrets, and keep a secure backup. It encrypts private calendar URLs; changing it makes existing links unreadable until re-added. It is separate from API keys. Development uses a local-only fallback. Missing production configuration disables calendar linking with a friendly message, not the rest of the app.
Test with a private Google/Canvas iCal link you control (or an Apple share link after considering its link-access sharing). Save in You → Calendars, check the masked URL and last-sync status, edit/delete an event at the provider, then Sync now. Confirm the mirror updates and cannot be edited in Pathway. Calendar HTTP access depends on the deployment's provider/network permissions. Mirrors cover the rolling previous 30 / next 180 days; unsupported/oversized calendars show an error and keep prior events.

## Installable app and Web Push
1. Use the HTTPS published URL. Installation and push need a secure origin (localhost also works for development). The service worker is built by `npm run build`; Vite development mode does not install the production worker.
2. In Replit Shell, run `npx web-push generate-vapid-keys`. Copy Public Key to deployment Secret `VAPID_PUBLIC_KEY` and Private Key to `VAPID_PRIVATE_KEY`. Set `VAPID_SUBJECT` to a contact URI such as `mailto:you@your-domain.com` (or your HTTPS contact URL). Keep the private key secret and backed up. Changing keys means devices need to unsubscribe and re-enable; subscription ciphertext is protected with the private key. No push service account is needed.
3. Republish on a Reserved VM. Missing/invalid VAPID configuration leaves notifications unavailable with an explanation; all other features keep working. No permission prompt is shown automatically.
4. On iPhone/iPad, open in Safari → Share → Add to Home Screen, then open the installed app (iOS/iPadOS 16.4+ supports installed web-app push). Android/desktop users can choose Install Pathway or their browser's install menu. Platform support varies.
5. In You → Notifications choose Enable on this device and accept browser permission, select a time between 7am and 9pm, and enable Daily nudge. Use Send a test nudge during free time; the test counts as today's one nudge. An accepted provider response is not a guarantee of device delivery. Verify actual delivery on the device.
6. Test pause/resume and Unsubscribe this device. Check class and quiet-hour suppression. At most one reserved attempt per day is deliberate: crashes/provider failures can skip a nudge rather than risk sending twice. An idle/suspended server cannot deliver timed jobs; do not rely on an Autoscale deployment sleeping with no users.
7. For offline testing, install/load once, go offline, and reopen: the public shell loads, while live data asks for a connection. No private API data is cached.

New deployment environment variables for these three features: `CALENDAR_SECRET` (private calendar encryption), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (optional Web Push). No AI key is needed for the tracker, calendar engine, or nudges. Keep existing database/access/provider Secrets.

## Combined sign-in and student-feature upgrade
Keep `SIGN_IN_SECRET` from the sign-in deployment, and add calendar/VAPID Secrets only for those optional features. Both phrase sign-in and student-feature migrations run on production startup. New migration-managed SQLite databases now include the matching account migration too; existing local databases can continue using db:push. Signing out removes notifications on that device; changing/recovering a phrase turns notifications off on all devices, which must opt in again.
