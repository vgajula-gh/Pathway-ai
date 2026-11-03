# Explore: show links first, enrich details second

This supersedes the strict admission and six-card visibility rules in [the original Scout rebuild](14-OPPORTUNITY-SCOUT.md), following the owner's request to remove qualification filters except expiration.

## Student experience

Only a confirmed, real deadline earlier than the student's local date hides a result. Missing deadlines, closed/unknown applications, future openings, stale sources, unreviewed domains, grade/region/format mismatches, fee concerns, unknown cost and unrelated interests remain visible with warnings and ranking factors. Visibility is not a claim that the student can apply or applications are open.

Primary picks still rank up to three confirmed Free and three Paid or cost-unconfirmed. Explore displays remaining unexpired library results in the same expanded groups without duplicates. Unknown cost never earns Free. Interested and Not for me remain explicit student choices; saved progress stays in Interested and dismissals remain student-specific. Samples require DEMO_MODE.

## Research and enrichment

1. Explicit Search checks the SQL catalog first. Public interests guide relevance and paid search gaps; private goals/project/time/budget remain local. Six relevant links can satisfy total coverage even with unknown prices; missing interests can still guide additional research within caps.
2. Valid named HTTPS leads survive malformed siblings. If research JSON is unreadable/truncated, recover only actual provider citations or literal HTTPS links in its response. Use returned titles or neutral URL labels; never guess a URL or program fact. No usable links means a real failure. The existing single format repair and no-retry bounds remain.
3. Persist safe leads to Opportunity and ResearchCandidate before fetching/extraction. All usable links can display beyond the bounded enrichment pool. Cost hints order that pool rather than excluding results. No deadline, cost, eligibility, evidence or Verified timestamp is invented.
4. Save fetched source snapshots even when extraction fails. Deterministic literal passage checks establish individual facts; unsupported details stay unknown. Redirects/different source titles enrich the original stored lead.
5. Confirmed past deadlines remove provisional links and retain the date/evidence. Missing extraction cannot erase an existing deadline. Other failures retain unconfirmed cards and produce a partial-results state instead of discarding links.
6. Started enrichment continues while its live student request is valid, even when provisional links fill coverage. Changed consent/preferences cancel outdated intent. Paid claims prevent silent replay after crashes.

Authenticated GET /api/opportunities can recover up to 100 earlier rejected/error candidates from stored public research, with no provider/fetch call. Reuse literal facts where available, otherwise restore only the original safe named link. Known-expired candidates stay excluded and existing catalog facts are preserved. This writes catalog/candidate links without rewriting old run history or usage.

## Trust, knowledge and limits

Unconfirmed links show Needs checking; only supported reviewed records gain Verified. HTTPS/DNS/robots/redirect/size safeguards, authentication/access codes, privacy, proposal approvals and AI limits remain enforced. PDF links may display without automatic reading. SQL owns cards; optional Pinecone embeddings require fetched text and funded preparation. Additional library results become eligible for program questions after Interested and preparation.

A settled search with usable partial links uses the normal successful-search allowance. Failure or an empty result uses no successful-search allowance; paid attempts still count globally. Earlier empty-result charges are restored once with an audit record. Explicit failed/empty retries wait one hour and are bounded to three unsuccessful shared-group attempts per UTC day. Existing configured attempt limits remain unchanged. An additional $25 default estimated discovery cap reserves funds before work and reconciles using observed tokens/tool calls; it is not a provider-wide hard billing ceiling.

## Deployment and validation

No new schema migration, Secret or data reset is required. Merge the PR, sync Replit, install/build and publish using [the deployment guide](../DEPLOY-REPLIT.md). Existing Scout migrations must already be applied; missing production tables/columns still require the existing Publish schema flow.

Regression tests cover unreadable/truncated research citations, six links after six extraction failures, overflow beyond primary picks, warning-only mismatches, expiry, preserved deadlines, redirects/title changes, recovery without paid calls, second-student reuse, limits and crashes. Mocked tests verify code paths; live Replit search quality remains an owner check because this workspace has no provider credentials or production database access.

## Evidence-first follow-up

All six follow-up modules and settings are documented in [sourcing](08-OPPORTUNITY-AND-NEWS-SOURCING.md) and [deployment](../DEPLOY-REPLIT.md). Research, qualification, optional extraction, budget/retry fixes, diagnostics and regression tests reuse existing tables. No production migration or reset is added. Default research returns links first; reported details stay explicitly unconfirmed until actual source text supports them. Unreadable output with no returned usable links still fails honestly.
