# Opportunity Scout rebuild

## Review findings

Existing production search reached providers and fetched pages. The latest owner report records 20 successful extractions and 20 verification rejections, including name/organizer quote mismatches, unsupported numeric grade bounds, unknown format, unreviewed domains and two expired deadlines. No new programs or source snapshots were saved; Pinecone indexing was never reached. One extraction timed out, and the shared monthly discovery allowance was exhausted. These are separate conditions.

The HTML reader also joins block/table text (`Grades9–12`), reproduced locally. Literal generated quotes and mandatory numeric-grade/format/organizer rules can discard useful active candidates. The catalog, picks and knowledge scope independently filter to verified-only results, so changing one verifier is insufficient. Rejected candidate identities/pages were not retained. The existing five-extraction cap also cannot fill six fresh slots for a single-interest student.

Reuse the provider adapters, LangGraph/LangChain, HTTPS/DNS/robots protection, Prisma shared catalog, student sessions/access codes, proposal approvals, existing budget counters and scoped knowledge retrieval. Improve the reader and evidence contract; add research persistence and bounded staged work; update qualification, ranking and every downstream filter together.

## Agreed delivery

1. Optional discovery preferences, versioned prompts, generated schemas, source passages and additive SQLite/PostgreSQL data model.
2. OpenAI/Anthropic research and extraction adapters, persistent staged research, bounded calls, cache reuse and budget-aware jobs.
3. Deterministic evidence/qualification: active verified or needs-checking candidates, announced openings on watchlist, honest costs and complete reasons.
4. Weighted per-student ranking, private preferences, feedback, variety and three Free/three Paid-or-unknown targets.
5. Shared You/Explore preference editor, actual progress, warning labels, Coming soon, cited questions and optional shared Pinecone preparation.
6. Protected owner diagnostics/test job, documentation, deployment/migration checks and end-to-end validation.

Each commit runs all tests and typechecks. One PR targets main. No production publishing or usage resets are part of this task. This execution environment has no configured provider credential or production database access; mocked/synthetic checks must be distinguished from a live Replit search.

## Public research and private selection

Only public interests, grade band, broad city/state/region, format and cost groups enter web research. No names, schools, private projects/goals, schedules or credentials. Personal goals/projects, time and maximum cost are applied per student. Public program records and snapshots are shared; student dismissals/preferences never hide a program from another student.

Source passage references produce exact citations. Dates, amounts, eligibility, activity and verification are checked by code. Missing details stay unknown. No program is fabricated to fill a slot, and no public-source indexing failure removes a useful stored recommendation.
