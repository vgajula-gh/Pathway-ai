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

## Discovery readiness regression

- Explore keeps its opportunity search control visible when setup is incomplete, student AI consent is off, discovery is running, or the manual allowance is spent. Disabled controls have an accessible explanation and catalog picks remain usable.
- Authenticated discovery status and catalog responses identify setup blockers with controlled codes and setting names only. Pinecone authentication, missing index, wrong metric/dimension and transport failures must not expose raw provider messages or key values.
- A failed refresh while unavailable consumes no manual allowance or AI quota. Consent-off status does not contact providers. Library readiness retries after a minute, can recover, and sends no paid AI requests. SQLite retains its memory store.
- OpenAI extraction requests the closed, required JSON schema. Unknown evidence is nullable and cannot verify a fact. Missing models fail before paid search; malformed JSON, schema fields, truncation and refusal have distinct safe diagnostics.
- Extraction failures with no saves produce failed run/request states, retain the student allowance, preserve shared paid counters and never replay automatically. Requested models are recorded without secrets.
- Owner checks default to no provider call. The --live path makes one hosted request against a synthetic fixture with no database or vector access. Tests exercise the real SDK HTTP request with network intercepted; live provider quality requires the explicit owner check.

## Readable discovery sources

- Read genuine generic-MIME HTML, reject real binary/PDF/JSON sources, and distinguish decompression corruption from excessive decoded size. Preserve robots, pinned DNS, private-address and redirect protections.
- Filter download URLs before the candidate cap; balance Free/Paid URLs and collect navigation eligibility links without including navigation in source evidence. Keep all provider, HTTP and extraction caps.
- Signed-in status summaries include all bound failures and actual step counts, can explain older runs with no new paid work, exclude unrelated records, redact arbitrary values and preserve unknown historical model/candidate data.

## Opportunity evidence regression

- Equivalent literal numeric grade ranges, ordinal ranges and contiguous lists verify; arbitrary model bounds, ages, rising grades, contradictory bounds and gaps in grade lists do not. Legacy verification retains organizer/domain rules. Scout separates optional details, source review and active qualification as described in the Scout contract.
- Verification failures record controlled required-field/reason pairs, separated from persisted facts. Status summaries drop arbitrary fields, reasons, source URLs and rejected values. Old records retain unknown details.
- Completed evidence rejections explain an empty search ahead of incidental fetch/exhaustion errors; setup/provider/extraction/storage failures retain priority. Allowances and automatic retry behavior remain unchanged.
- Synthetic source/extraction fixtures pass through the real graph, SQL storage, selection and HTTP routes to produce three Free and three Paid recommendations for two students. The second student reuses the shared catalog without new search or extraction calls. External provider/source access and production success still require live verification.

## Opportunity Scout acceptance

Covered by scout-foundation, scout-providers, scout-runner, scout-qualification, scout-ranking, scout-integration, scout-ui and scout-diagnostics tests plus discovery/knowledge API and Explore UI suites: public/private input separation; actual source→six-cards→second-student reuse; one-network-stage durability/no paid replay; 3-batch/16-lead/one-repair bounds; grade/date/cost/watchlist evidence; optional preferences, radius, strict online, weighted factors and feedback; safe partial Buddy preparation/scope; protected read-only diagnostics and explicit funded sample job. Preserve all existing access-code, AI-cap, sign-in, calendar, proposals, Today and export tests. Final checks include types, production build and a PostgreSQL upgrade/start smoke check; real provider/Pinecone/phone acceptance remains a Replit owner check. See [14-OPPORTUNITY-SCOUT.md](14-OPPORTUNITY-SCOUT.md).
