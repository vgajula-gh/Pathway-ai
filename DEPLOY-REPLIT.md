# Publish Pathway AI on Replit

You need a GitHub account, a Replit account with publishing enabled, and optionally an AI provider account. Use this for an invitation-only tester pilot. Access codes are shared secrets, not full individual account authentication: give each tester a different, long, random code and keep it private.

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

1. Open **Publish** / **Deployments**, and choose an Autoscale web deployment.
2. The repository's `.replit` sets the build command to `npm ci --include=dev && npm run build` and the run command to `npm start`. Keep these settings.
3. Replit supplies `PORT`; the API listens on `0.0.0.0` and serves both the website and `/api` on that port. If configuring a port manually, use `8787` (the default).
4. Ensure **Create production database** is enabled, then publish. Replit applies the development-to-production schema diff during Publish. The app inserts its sample opportunity and news catalogues at startup if missing; no demo students are created. Never run `db:setup` or `db:sync:replit` against production.
5. Open the published URL. Check that a wrong code is rejected, enter a valid code, finish setup, then open Today and You. Check Send feedback if configured. Share the URL and each tester's own code privately.

For an update, import/pull the latest `main` and republish. Replit applies schema changes during Publish. On startup failures, inspect deployment logs and confirm the production database was created and access codes are configured. A missing or unreachable production database prevents startup.

## Local development and Codespaces

Keep `.env` with `DATABASE_URL="file:./dev.db"`. Run `npm install`, `npm run db:setup`, and `npm run dev`. `db:setup` uses the SQLite schema and generates the matching Prisma client. Codespaces keeps this workflow. Leave `ACCESS_CODES` empty to skip the gate locally, or set codes to test it. After running a production build locally, run `npm run db:push --workspace apps/api` to regenerate the SQLite client before local development/tests.

`npm run build` generates the PostgreSQL Prisma client and builds the API and web app. `npm start` requires PostgreSQL and access codes, then serves the production build without a `.env` file. Replit supplies the production database URL and applies schema changes during Publish. The SQLite schema is the data-model source; the build derives the PostgreSQL schema from it. Future model changes must be synced to the Replit development database with `npm run db:sync:replit` before publishing.

Existing local SQLite profiles are not copied to PostgreSQL automatically. The pilot database starts empty. Returning testers use their original code and browser profile; removing a code revokes its API access. Browser sessions retain the access code only for that tab's session. This pilot gate retains the existing browser-stored student ID and is not a substitute for production account authentication.
