# Explore and program-answer evals — Drop A

This is an owner/developer quality check, not a new student screen. It evaluates Explore and scoped program answers before release. It adds no database migration, production endpoint, MCP server or automatic paid background task.

## Quick start: free, offline replay

From the repository root after `npm ci`, run:

```sh
npm run eval:explore
```

The terminal prints the report directory. Open `report.md` to read the scorecard or `report.json` for machine-readable results. `review.csv` is an editable human-review worksheet for live public programs and synthetic answer samples. Default reports go under ignored `artifacts/evals/<timestamp>-offline/`. Keep a named baseline with:

```sh
npm run eval:explore -- --label baseline --out artifacts/evals/baseline
```

Use a new/empty output directory each time; the launcher refuses to overwrite existing reports. Offline mode does **not** load `.env`, use real provider transports or need API keys. It deliberately supplies replayed model/search responses, saved synthetic public-program HTML and deterministic local embedding vectors. Its fixed scenario clock is June 15, 2030; run timestamps are recorded separately.

The fixtures use `example.edu` and invented program names. These are **not real opportunities** or a human-reviewed ranking benchmark. The test database marks the synthetic rows as non-sample solely to exercise production catalog filtering inside that isolated database.

## What the 15 offline scenarios exercise

| Scenario | Production path being measured | Required outcome |
|---|---|---|
| Evidence-first discovery | Real research parser → persisted Scout LangGraph → source qualification → SQL → catalog route | Six actual fixture links saved, costs supported, no per-candidate extraction model call |
| Citation recovery | Unreadable research JSON + actual returned citations + failed source reads | Useful unconfirmed links survive; unknown prices are not Free; no fabricated pages/chunks |
| Display and relevance | Catalog ranking plus the same recommendation selector used by the React screen | Up to five Free/five Paid, unique IDs, at least 0.8 interest precision on these labeled fixtures |
| Catalog reuse | Refresh endpoint for a second synthetic profile with consent off and sufficient shared coverage | Cached coverage is reused without new paid research or copied private progress |
| Expiration/uncertainty | Catalog/scoring and current expiration-only admission | Past deadlines excluded; unknown prices/deadlines and grade/location mismatches retain checks |
| Research privacy | Actual public context allowlist and Scout prompt builder | Selected interests included; private name/project/goal fields excluded |
| Supported program answer | Real ingestion → LangChain retrieval/SQL checks → question graph → answer renderer | Relevant passage retrieved, exact aid quote and own-source citation returned |
| Unsupported answer | Malicious/fabricated model excerpts and nonexistent chunk IDs | Unsupported claims dropped; honest no-answer; no fake citation |
| Structured facts | Conflicting model date/price quotations versus SQL-backed facts | SQL source-backed deadline wins; model's conflicting structured claims are not rendered |
| Ownership | Different authenticated synthetic profile + faulty vector-store matches | Unowned program denied; wrong-program chunks filtered; no agent mutation |
| Stale/outage behavior | Changed source hash, then unavailable knowledge runtime | Stale chunks rejected; useful catalog remains; program question returns controlled unavailability |
| Adversarial refinement | Untrusted source instructions and a draft asking for another student's program | Scope stays bound, valid excerpts survive, invented claims are removed and refinement is bounded |
| Program-source quality | Real research parser and Scout with Maps/search listings plus a direct program URL | Only the direct program is fetched/saved; listings do not become recommendations |
| Preparation recovery | Actual preparation module, saved source text and an unfunded limited marker | New allowance recovers without refetching or changing source dates; SQL and local vectors agree |
| Listing-only allowance recovery | Current-cycle successful personal search containing only Maps links | Personal slot restores once; shared paid usage/history remain intact |

These are integration evals: real service/domain/API/UI-selection behavior with controlled external boundaries. Offline replay cannot prove a real model resists a prompt injection or finds relevant real-world opportunities. Those require the live canary and human review. The offline embedding vectors test plumbing, scope and source-generation checks; they do not benchmark semantic embeddings or connect to Pinecone.

## Live canary: explicit, bounded and separate

Run only from a development/owner shell with the desired provider credentials. Do not use a production run command or alter published app settings to run evals. The live command can load a local `.env`; Replit development Secrets can also supply credentials. Publishing-only Secrets are not automatically available in the development shell.

Example using OpenAI (substitute model IDs that your API account supports):

```sh
npm run eval:explore:live -- \
  --allow-paid \
  --provider openai \
  --search-provider openai \
  --model gpt-4.1-mini \
  --search-model gpt-4.1-mini \
  --max-estimated-usd 4 \
  --max-provider-calls 10 \
  --label openai-mini \
  --out artifacts/evals/openai-mini
```

This performs one current-date public research scenario and three program-answer scenarios (supported aid, missing information and untrusted-page instructions). The research scenario runs the real default evidence-first Scout with safe public-page fetching; the answer scenarios use the same saved synthetic HTML so different models see comparable evidence. It does not send real student profiles, schedules or chats. Individual question graphs may use up to three draft rounds, so ten provider requests covers one research request plus three worst-case three-round questions.

Both OpenAI and Anthropic adapters are supported, including independently selected search/answer providers. Supply their normal `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` in the shell. Ollama remains an app option but is not a live web-research provider in this eval canary.

The CLI requires `--allow-paid`, both numeric budget flags and resolvable answer/search model IDs. Options override configured model defaults **inside the eval child process only**. It never changes `.env`, Replit Secrets or the published server. It fixes the default evidence-first source mode, allows two web tools inside the single research request and caps source processing at four page invocations. There is no paid extraction/format-repair fallback or automatic provider retry in this small canary. A page invocation may include the production fetcher's bounded robots/redirect HTTP requests; it is not a count of every raw HTTP exchange.

Before each inference/research request, the harness reserves a conservative estimate and a call slot. Accepted failures/unknown outcomes retain reservations and are never silently replayed. If the remaining budget is insufficient, later work stops and the report fails with `budget_exhausted`; a partially evaluated run cannot pass. Observed usage/model IDs, safe failure codes and HTTP status (when available), latency and estimates are recorded without raw provider exceptions.

Estimate prices use `SCOUT_INPUT_PRICE_PER_MILLION`, `SCOUT_OUTPUT_PRICE_PER_MILLION` and `SCOUT_WEB_SEARCH_PRICE_USD`, with code defaults 4, 16 and 0.025 respectively. These are owner-configurable **estimates**, not claims about a vendor's current price or a vendor-enforced billing ceiling. Reservations assume up to 60,000 input/8,000 output tokens plus the bounded research tools. Unexpected larger observed estimates increase the held amount and stop further calls when necessary; unknown errors keep the original hold. The call-count bound remains independent of price estimates.

Paid eval costs are **separate from production student/daily/monthly counters** because the run owns an isolated database. It cannot reset production usage. Use vendor billing controls as well if a strict external spending limit is required.

Live research creates a review queue of public names/URLs. The report also includes the final rendered answers to the three synthetic questions; use `review.csv` to record relevance, official-source/grounding judgments and notes. These annotations are manual sign-off material and do not automatically change the reported gate. It does not automatically certify relevance, official ownership, current application availability or price accuracy. Live program-answer metrics include draft schema validity, expected source-answer presence, final citation validity, claim/excerpt support rates and model-call counts. Retrieved-source exactness does not by itself establish that a quote answers the question.

## Reading the scorecard and comparing changes

The report keeps eight areas separate: discovery, sources, catalog, indexing, retrieval, answers, privacy and budget. It records observed saves/source counts, fixture interest precision, retrieval recall, accepted citations and other scenario-specific metrics. A zero `knowledgeChunks` count after research alone is not a discovery failure: actual page ingestion is a separate step.

Every offline required check and all 15 cases must pass. Dataset `explore-qa-v2` adds recovery/source cases and intentionally changes the fixture digest; compare new baselines with the same dataset. A failed/empty/incomplete scenario fails the gate and returns a nonzero exit code. A successful live run says **review_required**, not production-ready. Failed live automated checks return nonzero. Owner setup errors return exit code 2.

Compare two saved reports:

```sh
npm run eval:explore:compare -- \
  artifacts/evals/baseline/report.json \
  artifacts/evals/candidate/report.json
```

The comparison requires the same mode, fixture digest and case IDs; offline and live results are not interchangeable. Model/prompt differences are identified rather than rejected. Reports include the dataset version/hash, prompt hash, Git revision, tracked-working-tree state and actual call model IDs where returned. A timing difference on a developer machine is not a controlled latency benchmark. Public names/URLs in reports are review material, not student recommendations approved for publication.

## Isolation, CI and implementation

The launcher creates a nonce-marked temporary SQLite directory, generates the SQLite Prisma client, applies local versioned migrations and constructs the eval client only for that owned file. PostgreSQL URLs and arbitrary local databases are rejected. Cleanup runs on normal success/failure; abrupt process termination can leave a temporary fixture directory, never permission to query production. Eval execution belongs in a workspace, not inside the running published app, because Prisma client generation changes generated local files as normal SQLite tests do.

A narrow child environment excludes production database URLs, unrelated Secrets and tracing/vector configuration; offline credentials are fake and all external provider/page boundaries are replayed. LangSmith tracing stays disabled. Reports contain counts/checks, public review links and final answers from the synthetic question fixtures—not raw provider responses, prompts, real student chat history, private reflection text, keys or raw provider exceptions. Keep artifacts private to the pilot/repository team where appropriate.

GitHub Actions runs the normal tests, API/web type checking, eval type checking and offline replay on pull requests/main pushes, and uploads the scorecard for 14 days. Paid live evals are never run automatically. The owner can require the **offline-quality** check through repository branch protection; adding a workflow alone does not enable that GitHub setting. Replit Publish still requires its normal database-readiness and signed-in smoke checks.

Principal files:

- [CLI launcher](../scripts/eval-explore.mjs), [comparison command](../scripts/compare-explore-evals.ts).
- [Integration cases](../apps/api/evals/drop-a.eval.ts), [versioned dataset](../apps/api/evals/fixtures/dataset.json), [HTML snapshot](../apps/api/evals/fixtures/program.html).
- [Scorecards](../apps/api/evals/scorecard.ts), [per-run budget](../apps/api/evals/budget.ts), [database isolation guard](../apps/api/evals/isolation.ts).
- [Shared Explore display selector](../apps/web/src/lib/explore-recommendations.ts), [harness regression tests](../apps/api/test/eval-harness.test.ts), [CI workflow](../.github/workflows/quality.yml).

Drop A intentionally does not add Buddy-planning/Growth-quality eval suites or an MCP integration. Those remain separate drops.
