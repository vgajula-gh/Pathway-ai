# 10 · Phased Backlog & Acceptance Tests

Status key: ✅ in this kit · 🟡 partial · ⬜ to build

## Phase 0 — Prototype (this kit)
| ID | Story | Status | Acceptance test |
|---|---|---|---|
| P0-1 | Onboarding without integrations | ✅ | Complete 6 screens with no calendar/email; student created; provenance recorded |
| P0-2 | My Day rings + next step | ✅ | Rings show minutes/steps; contributors sheet explains; Later hides until tomorrow; Why shows source + data used |
| P0-3 | Opportunity Scout (sample) | ✅ | Ineligible grade excluded with reason; each card shows factors; unverified label visible |
| P0-4 | Prep reminder approval | ✅ | Proposal shows actions/data/effect; Approve → VERIFIED; reminder in timeline; goal + 2 steps in Grow |
| P0-5 | Revalidation on approve | ✅ | Add a conflicting event before approving → FAILED with reason, nothing applied |
| P0-6 | Idempotency | ✅ | Same actions cannot execute twice |
| P0-7 | Buddy with tools | ✅ | "Biology exam Friday, soccer Wednesday" → tool calls → proposal; reply says "waiting for approval" |
| P0-8 | Schedule extraction preview | ✅ | Missing fields block save; low confidence flagged; nothing saved before confirm |
| P0-9 | Portfolio capture + visibility | ✅ | Private by default; toggle shared; export JSON |
| P0-10 | Export & delete | ✅ | Export contains all entities; delete removes all rows |
| P0-11 | Audit log | ✅ | Approve/decline/edit/delete appear with actor and time |

| P0-12 | Appearance + top navigation | ✅ | Toggle cycles Dusk/Dark/Light/Auto; choice persists |
| P0-13 | News for you | ✅ | Defaults from interests; topic toggle persists; stories without source never shown (news.test.ts) |
| P0-14 | Buddy home + threads | ✅ | Orb home lists last + earlier chats; new topic → new thread; "‹ Buddy" returns home |

## Phase 1 — MVP
| ID | Story | Status | Acceptance test |
|---|---|---|---|
| M-1 | Real auth + age gate + consent | ⬜ | No API access without session; under-13 blocked or consent flow |
| M-2 | Opportunity sourcing pipeline | ⬜ | Verified items show source + checked date; expired auto-hidden |
| M-3 | Snooze/dismiss persistence | 🟡 | Snooze survives reload (store per day) |
| M-4 | Reminder notifications (opt-in) | ⬜ | Push/email only with consent; ≤1 nudge/day default |
| M-5 | Streaming Buddy replies (SSE) | ⬜ | Tokens stream; tool status line updates live |
| M-6 | Agent eval suite | ⬜ | 20 golden cases pass (see 07) |
| M-7 | Accessibility audit | ⬜ | Axe clean; keyboard-only journey A passes |
| M-9 | News ingestion job | ⬜ | Daily stories per topic with source + checkedAt; >30 days pruned |
| M-10 | Learn from feedback | ⬜ | "Not for me" asks why (too far / not my thing / no time); reasons adjust ranking weights per student |
| M-11 | Week-ahead check-in | ⬜ | Sunday proposal balances tests, practice and goals; flags overloaded days; one approval |
| M-12 | Growth insights | ⬜ | Top skills from portfolio; suggests one opportunity for a missing goal skill |
| M-8 | Postgres + migrations + backups | ⬜ | `prisma migrate deploy` in CI; nightly backups |

## Phase 2 — Grow
Learning paths with checkpoints · adaptive difficulty from feedback · reflections prompts · calendar integrations (Google/Microsoft read-only first) · PDF schedule parsing · portfolio PDF export.

## Phase 3 — Explore
Opportunity Gap Finder · Opportunity Creator (design your own project/club) · Adaptive Growth Coach · parent/counselor views with student-controlled permissions.

## Test commands
`npm test` (domain unit tests) · add API integration tests with `app.inject()` (Fastify) against a temp SQLite DB · add Playwright E2E for Journey A.

## Buddy voice acceptance checks

- Voice is off for new and existing students; You › Privacy saves and audits the preference.
- Supported recognition shows a mic only with Voice enabled; listening has a visible status and stop button. Unsupported browsers retain typed chat.
- Dictation preserves existing draft text, updates interim results without duplication, and never sends. Stop, edit the draft, then explicitly send.
- Read replies aloud is separately selected, reads new replies only, and has a stop control. Unchecking it, disabling Voice, and leaving Buddy cancel playback.
- Permission denial and speech errors show helpful messages; no audio capture, uploads, or storage.
- Automated browser API mocks cover recognition, draft updates, opt-in, errors, cleanup, and settings persistence. Manual supported-browser microphone and speaker checks are needed for actual audio hardware.
