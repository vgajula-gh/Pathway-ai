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
| propose_actions | summary, rationale, actions[] | proposalId, status | **only write path**; zod-validated; calendar revalidated |

## Action types
`add_event` · `move_event` (non-recurring) · `remove_event` · `add_goal {ref}` · `add_milestone {goalRef}` · `save_opportunity` · `add_portfolio_entry`. Reminders = `add_event` with `eventType:"reminder"`, 15 minutes.

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
