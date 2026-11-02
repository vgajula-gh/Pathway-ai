# Pathway product design: Today, Explore and program knowledge

This is the current design for these modules; [01-PRD](01-PRD.md) remains the wider product brief. Pathway is a private student-success companion, with deterministic facts and approved plan changes.

## Today

Use a slim first-name greeting/date. Order: Your day at a glance (rings, compact timeline, Due soon within seven days), Next best step (pending approval first, Do it/Later/Why, Explore empty state), Today's spark (word/news preferences). Keep Buddy’s floating orb. Add event and Link calendar are explicit actions on an empty day.

## Explore

Start without dummy recommendations. Interested is visible only with saved applications and stays above Opportunity search. Students edit interests and broad region inline. First use offers Search for opportunities; merely opening Explore does not queue a web search. Both Search for opportunities and Search again check the shared verified active library first. Display up to three Free and three Paid in total across interests, with Paid collapsed for free-only budgets. Search only interests with no suitable match; if all interests are represented but a bucket is short, target the least-covered interest for that bucket. Keep existing results visible while filling gaps. Coverage checks every selected interest; at most five topic groups are queued per request, and any remaining gaps still require the usual allowances. Student B can reuse Student A’s discoveries without another paid search. Complete library coverage costs no search/AI allowance and remains available when AI is off or caps are reached. Cards retain sources, check dates, countdowns, fit explanation and cost uncertainty.

Competitions require a future official deadline. Other programs need a future official deadline or checked open/rolling statement. Clubs and volunteering need open sign-up or current/upcoming activity. Hard eligibility exclusions, expiration and freshness are code decisions. Only explicit free participation earns Free. Unknown cost belongs to Paid with a warning. Variety/urgency refine fit ranking; permit at most one eligible outside-interest stretch item.

Interested creates a requirements/deadline tracker without changing the student’s schedule. Not for me records a reason. Both refill from the shared catalog without AI. A completed manual search is allowed once per rolling 30 days plus one meaningful-interest-change bonus; failed searches do not consume it. Paid provider attempts remain counted globally. Missing integrations, searching, partial results, no matches, no interests and failures have honest states with no fabricated cards.

## Shared knowledge and trust

Each public program’s source pages and approximately 500-word/50-word-overlap chunks are stored once. SQL owns text, citations and student membership; Pinecone holds public vectors in opportunities. A card’s Ask action becomes available only when chunks match source hashes, embedding identity and the selected vector index. Server-derived StudentPick + Interested membership governs single-program and my_opportunities retrieval on every turn. Cross-program responses are grouped; database/rules supply structured facts; the verifier accepts only exact supported excerpts for text answers, with sources/check dates and a three-round retrieval ceiling. No answer is invented when an official page does not say.

Requirements buttons create proposals; approval revalidates source evidence, merges steps and reports VERIFIED/FAILED. Nothing submits an external application. Student data is exportable/deletable; no profile data is sent to Pinecone. DEMO_MODE defaults false; intentional sample demos are labeled. Manual sample cleanup protects student references and never runs at startup.
