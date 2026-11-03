# Pathway product design: Today, Explore and program knowledge

Current Explore policy: [Explore simplification](15-EXPLORE-SIMPLIFICATION.md) supersedes older active-only/eligible/source-fresh admission, separate watchlist, cost-hint quotas and six-card visibility rules below. Only a confirmed past deadline hides a result. Other details remain warnings/ranking factors. SQL stores search links before enrichment; unreadable details produce visible unconfirmed results. Source evidence, privacy, proposals, knowledge scope and AI limits remain enforced. This simplification adds no schema migration.

This is the current design for these modules; [01-PRD](01-PRD.md) remains the wider product brief. Pathway is a private student-success companion, with deterministic facts and approved plan changes.

## Today

Use a slim first-name greeting/date. Order: Your day at a glance (rings, compact timeline, Due soon within seven days), Next best step (pending approval first, Do it/Later/Why, Explore empty state), Today's spark (word/news preferences). Keep Buddy’s floating orb. Add event and Link calendar are explicit actions on an empty day.

## Explore

Start with the shared SQL catalog, without dummy recommendations. Interested is shown only when applications are saved. Optional You/Explore preferences affect ranking and warnings, not qualification. Only a confirmed past deadline hides a result. Missing/mismatched grade, area, format, cost, source review/freshness and application status stay visible with checks. Unknown deadlines never imply open applications. Verified requires actual source support; unconfirmed links show Needs checking.

Research starts only after an explicit Search action, checks existing relevant links first, and searches missing interests within the normal caps. Persist links before enrichment, recover actual citations when research JSON is unreadable, and retain links when extraction fails. A partial-results message explains incomplete details. Primary picks rank up to three confirmed Free and three Paid or cost-unconfirmed, followed by other unexpired catalog links. Both cost groups are expanded. Six relevant links can meet total coverage even if prices are unknown. Student B can reuse the same public catalog without new provider work.

Literal-source checks still establish facts; unsupported values remain unknown. Interested/Not for me preserve each student's choices. Plan, reminder and requirements changes require approval. Successful partial searches use the ordinary successful-search allowance; failed searches without usable results do not, while paid attempts remain counted globally. No automatic provider retries or quota resets are added.

See [Explore simplification](15-EXPLORE-SIMPLIFICATION.md) for the current contract and recovery/deployment checklist; it supersedes the original stricter Scout admission rules.

## Shared knowledge and trust

Each public program’s source pages and approximately 500-word/50-word-overlap chunks are stored once. SQL owns text, citations and student membership; Pinecone holds public vectors in opportunities. A card’s Ask action becomes available only when chunks match source hashes, embedding identity and the selected vector index. Server-derived StudentPick + Interested membership governs single-program and my_opportunities retrieval on every turn. Cross-program responses are grouped; database/rules supply structured facts; the verifier accepts only exact supported excerpts for text answers, with sources/check dates and a three-round retrieval ceiling. No answer is invented when an official page does not say.

Requirements buttons create proposals; approval revalidates source evidence, merges steps and reports VERIFIED/FAILED. Nothing submits an external application. Student data is exportable/deletable; no profile data is sent to Pinecone. DEMO_MODE defaults false; intentional sample demos are labeled. Manual sample cleanup protects student references and never runs at startup.

The complete Scout contract, caps, ranking and owner test flow are in [14-OPPORTUNITY-SCOUT.md](14-OPPORTUNITY-SCOUT.md). The SQL LangGraph runner persists each stage; foreground calls advance one bounded network stage and never automatically replay an unknown paid outcome.
