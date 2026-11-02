# 07 · Agent & Tool Contracts

**One orchestrating agent ("Buddy")** with tool use on **Claude or OpenAI** (`LLM_PROVIDER`). The loop lives in each adapter (`apps/api/src/agent/llm/anthropic.ts`, `openai.ts`); `buddy.ts` supplies the prompt, history and tool executor. Max 6 tool rounds per turn. System prompt: `agent/prompts.ts`.

## Tools (all deterministic code)
| Tool | Input | Output | Notes |
|---|---|---|---|
| get_schedule | from, to (≤21 days) | events, conflicts, per-day capacity, rules | recurrence expanded |
| find_free_slots | from, to, minutes, count? | slots[] | inside study window; avoids commitments & downtime; ≤2/day; daily limit |
| check_plan | sessions[] | {ok[], problems[]} | must be used before proposing calendar blocks |
| search_opportunities | query? | results with factors + verified flag; excluded with reasons | hard exclusions first |
| get_learning_resources | topics[] | curated resources | only these URLs may be recommended |
| search_knowledge | opportunityId, query (≤1000 chars) | up to five official passages with sourceUrl, pageTitle, checkedAt | vector filter and database scope checked; max three searches/turn |
| propose_actions | summary, rationale, actions[] | proposalId, status | **only write path**; zod-validated; calendar revalidated |

## Action types
`add_event` · `move_event` (non-recurring) · `remove_event` · `add_goal {ref}` · `add_milestone {goalRef}` · `save_opportunity` · `add_portfolio_entry` · `add_application_requirements {opportunityId, checklist, deadline?, referenceHash}`. Reminders = `add_event` with `eventType:"reminder"`, 15 minutes.

## Policies baked into the prompt
Use tools for facts · never claim a change happened · protect downtime and leave breathing room · unknown deadlines stay unknown · explain why it fits + one next step · integrity in learning · no admissions predictions or invented achievements · ask one clarifying question when date/ownership/intent is ambiguous · under 150 words.

## Failure handling
Tool errors return `is_error: true` with a readable message (e.g., zod issues or calendar conflicts) so the model can correct and retry. If AI is disabled or consent is off, endpoints return 503/403 and the UI shows a clear state; deterministic features keep working.

## Provider parity
Run the same golden conversations on both providers. Differences to watch: parallel tool calls, how tool errors are retried, JSON strictness, and image reading quality.

## Evals to add *(backlog)*
Golden conversations for: exam + practice overlap (must not schedule over practice), ineligible grade (must not recommend), unknown deadline (must say confirm), homework request (must coach), "add it" without approval (must propose, not claim).

## Ollama testing

The local Ollama provider uses the same prompts, tool validation, proposal approval, and verification flow. Invalid tool-call JSON is returned to the model as an explicit error and never executes a tool. Local JSON-mode failures retry once without JSON mode and parse the response defensively. The default text model cannot read images.

## AI request caps

The HTTP boundary reserves persistent AI usage before Buddy, extraction, coach, and insight calls. Limits apply equally to every LLM provider; tool execution and proposal approval are unchanged. One feature request includes its internal tool rounds and provider retries. Quota rejection returns 429 before invoking the model. See `docs/06-API.md` and `DEPLOY-REPLIT.md`.

## GPT-5 nano response budget

Hosted `gpt-5-nano` (including dated snapshots) uses low reasoning effort and 4,096 completion tokens of additional headroom for each model call, because reasoning and visible output share the completion allowance. This is a maximum, not a fixed charge. Other models and Ollama keep their existing limits. Incomplete or empty responses return a friendly 502 rather than Buddy's generic empty-answer fallback; truncated tool calls are not executed. No automatic retry is added. Server diagnostics include only model, finish reason and reasoning-token count, never student text or credentials. Live provider quality/availability still needs deployment verification.


## Program-scoped retrieval and checklist proposals

Ask about this program passes a real opportunityId in the API request and persists it on the conversation. Its loop exposes only the read-only search tool; plain text cannot switch scope. An initial retrieval plus at most two further searches supports rephrasing, with three model rounds maximum. Public page text/history are untrusted data with no authority to execute actions. Eligibility/cost come from code, with unknown details labeled for confirmation.

The final structured model output is `{claims:[{chunkId,quote}]}`. The verifier accepts only exact excerpts (10–600 characters) present in returned passages, up to 120 quoted words; unsupported IDs, paraphrases, added claims and invalid JSON are removed. Each displayed excerpt has a clickable source and check date. An empty supported answer says the official pages do not say and supplies the official link. This deliberately favors traceable excerpts over unsupported fluent answers.

The explicit checklist button builds a deterministic source-backed proposal. Its action carries checklist titles/source URLs, optional deadline and an evidence hash. Creation and transactional execution both require that student's existing Interested application and unchanged source evidence. Approval merges new titles without resetting completed ones, stores citations and a separate cited deadline, and preserves student dates/notes. It reports actual VERIFIED/FAILED status and audits the outcome. It does not register or submit an application.

Shared discovery and source re-check attempts also reserve one request against the existing **AI_MONTHLY_LIMIT** overall counter. They never consume a student's daily allowance. Their separate discovery/re-check run budgets are additional limits; an exhausted overall AI cap blocks new paid background attempts too.
