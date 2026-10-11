# 11 · Requirements Traceability

| PDD requirement | Module | Test / evidence |
|---|---|---|
| Student DNA with provenance, edit, delete | routes/students.ts · pages/You.tsx | P0-1, P0-10 |
| My Day: priorities, commitments, deadlines, one next step | routes/today.ts · domain/metrics.ts · pages/Today.tsx | P0-2 |
| Mark-done, snooze, explain-why | Today.tsx · PATCH /api/events/:id | P0-2 |
| Distinguish student vs imported vs AI items | Event.source · SOURCE_TAG | P0-2 |
| AI Buddy with screenshot/PDF intake + confirmation preview | routes/ai.ts · ScanSheet.tsx | P0-8 |
| Clarifying questions | agent/prompts.ts | eval (07) |
| Opportunity normalization fields | prisma Opportunity | schema |
| Eligibility, timing, cost, confidence checks | domain/scoring.ts | scoring.test.ts |
| Explain fit, effort, readiness, next step; save/dismiss/compare | routes/opportunities.ts · Explore.tsx | P0-3 |
| Flag unverified/expired; no fabricated deadlines | scoring.ts (deadline exclusion) · sourceCheckedAt | scoring.test.ts |
| Learning without answer-only homework | COACH_SYSTEM | eval |
| Goals → small steps with effort; narrative progress | growth.ts · Grow.tsx · metrics.ts | P0-4 |
| Portfolio with skills, reflection, visibility, export | growth.ts · Grow.tsx | P0-9 |
| Action Agent: scope, data, consequences; approval; verify; audit; fallback | lib/proposals.ts · ProposalReview.tsx | P0-4/5/6/11 |
| Capacity-aware; protect rest | domain/schedule.ts | schedule.test.ts |
| No external action without approval | AGENTS.md rule 3 · no outbound integrations | review |
| One sourced news headline; interest-based update | routes/news.ts · domain/news.ts · NewsSheet.tsx | news.test.ts |
| AI Buddy continuity | Conversation model · Buddy.tsx | P0-14 |
| Accessible, responsive | app.css · aria labels | M-7 |
