# 02 · Information Architecture & UX Flows

## Navigation (mobile-first, top bar)
A sticky top bar holds the brand, an appearance toggle (Dusk → Dark → Light → Match device) and the profile avatar, with five section pills below. The Buddy composer stays at the bottom for thumb reach. Today has a floating "Talk to Buddy" orb.

| Tab | Pillar | Purpose |
|---|---|---|
| **Today** | Simplify | Day at a glance, next best step, then today’s spark |
| **Explore** | Discover | Active Free/Paid picks; search, Interested tracker and cited program questions |
| **Buddy** | All | Conversation with tools; schedule scan; inline proposals |
| **Grow** | Grow/Prepare | Growth story, goals & steps, learning companion, portfolio |
| **You** | Trust | Student DNA with provenance, My Day settings, privacy, activity log, export/delete |

Secondary surfaces are **bottom sheets** (detail, review, forms). One primary action per card.

## Onboarding
1. Welcome — promise and orb.
2. "Your journey is yours" — decide / private / delete; **AI consent toggle**.
3. Name + grade.
4. Interests (chips).
5. Aspiration (optional, skippable).
6. Study window + protected downtime. A labeled sample week is offered only with DEMO_MODE=true.
7. Create and confirm a private sign-in phrase; save the one-time recovery code. New profiles open Explore; returning profiles open Today.

## Flow A — Discover → verified reminder
```mermaid
sequenceDiagram
  participant S as Student
  participant W as Web
  participant A as API
  S->>W: Explore tab
  W->>A: GET /api/opportunities
  A-->>W: ranked list + factors (hard exclusions applied)
  S->>W: Open opportunity → "Set a prep reminder"
  W->>A: POST /api/opportunities/:id/prep
  A-->>W: Proposal (AWAITING_APPROVAL, dataUsed, effect)
  S->>W: Review → Approve
  W->>A: POST /api/proposals/:id/approve
  A->>A: revalidate → transaction → verify → audit
  A-->>W: VERIFIED (or FAILED with reason)
  W-->>S: Reminder on Today; goal + steps in Grow
```

## Flow B — Schedule scan
Photo or pasted text → `POST /api/extract` → **preview** (each row editable; missing fields outlined; low confidence flagged) → student confirms → `POST /api/events/bulk`. Nothing is saved before confirmation.

## Flow C — Growth story
Mark step done or goal reached → "Capture an experience" (what, kind, date, reflection, skills chips, share toggle) → saved private by default → "Explore related experiences".

## States every screen must handle
Loading (typing dots) · empty (friendly next action) · AI off (consent) or unavailable (503) · partial extraction · proposal FAILED/EXPIRED · offline/network error toast.

## Today layout (top to bottom)

A slim one-line first-name greeting and student-local date, with a subtle time-of-day accent.

1. **Your day at a glance:** three rings and contributor sheets; compact timeline with time, source, clashes and flexible-item completion; Due soon for Interested applications and calendar exams/deadlines in the next seven days. An open day says “Your day is open. Add a class or deadline, or link your calendar.” Add event, Link calendar and the inline Today/Week toggle remain available.
2. **Next best step:** a pending approval takes priority. Otherwise one suggestion with Do it, Later and Why this? Later sets it aside on this visit. With no suggestion, link to Explore opportunities that fit you.
3. **Today's spark:** word and sourced news at the bottom; respect both preferences and hide the whole section when both are off.

Keep the floating Talk to Buddy orb. No dummy events, goals or suggestions fill empty space.

Ring details explain their source: Study planned sums today's Study blocks against the daily limit regardless of completion; Free time left counts only future unbooked study-window minutes. Protected downtime left appears separately below the rings and in the free-time contributor sheet, reduced by actual calendar overlaps with an overlap warning. Progress counts this week's goal steps. Availability is editable in You. At 8 PM with default windows and no bookings, show 1h free plus a separate 2h rest summary. Time estimates refresh every minute while visible and on return/focus using read-only requests; no AI request or allowance is used.

Timeline starts on Today. Tap Week to see Monday–Sunday vertically without opening a sheet. Previous week / This week / Next week changes the displayed dates only. Today is highlighted, and each empty day says Nothing scheduled. Tap a date header to choose the default date for Add event; current week selects today initially, other weeks select Monday. Date headers and completion controls have accessible labels/pressed state and at least 44px touch targets. Writable, non-recurring Study/Reminder/Personal events can be crossed out and restored in either view; imported/recurring events have no completion control. Save failures show an error and preserve the prior state. Loading another week disables Add event until the dates are known; weekly read failures offer Try again and leave the Today toggle usable. Rings and Due soon remain anchored to today. Existing minute/focus refreshes also update the visible week without losing a valid selected date. Scan schedule and Link calendar stay accessible.

## Explore and program questions

Show **Interested** above search only when at least one application exists. Preserve Interested → Preparing → Applied → Result, notes, checklist progress, one next step and deadline countdowns, including “Deadline passed” for expired applications.

Always show **Opportunity search / Opportunities picked for your interests**. Interests are editable chips and region is an optional US state or Virtual only; no street address. On the first visit, offer Search for opportunities. Both search buttons check the shared recent active catalog before queuing work; opening Explore never queues a new search. Search only missing interests or Free/Paid bucket gaps, keeping existing results visible. The visible page polls and requests bounded server work; closing the page does not replay paid work. A timer and owner cron can finish it.

Show actual persisted search/read/check stages and candidate/page/qualified counts, without fake names. Show up to three Free and three Paid cards with organizer/type, future deadline or evidenced open sign-up, countdown, Verified versus Needs checking and source-read date, honest cost/aid and Why it fits. A free-only student expands Show paid or cost-unconfirmed options deliberately. Partial buckets show the actual count. No matches, no interests, missing setup, monthly cap and failed search each have their own state. Errors offer Try again; unavailable setup explains the blocker.

Interested pins extracted source-backed requirements and deadline and refills from the shared catalog. Not for me asks a reason, hides the item and refills its bucket. Neither action invokes AI. Search for more allows one successful manual search per rolling 30 days plus one earned interest-change bonus; failures leave that allowance intact. A full library covering every selected interest and three Free/three Paid in total needs no web search or manual debit. It stays reusable even with AI off or a shared/personal cap reached. Changing interests repeatedly does not auto-spend more searches. Public paid attempts still count toward monthly caps. A historical limited status is rechecked against current limits and counters; raising a cap restores the action without deleting usage.

Program cards and Interested items show Preparing details until their current shared chunks are indexed. Ask about this program opens a scoped Buddy thread. Ask about my opportunities uses the current server-owned picks + Interested set, groups answers by program, and cites official sources/check dates. Structured facts come from SQL/rules, textual claims must match passages exactly, and missing information gets the official-page no-answer message. Checklist changes remain proposals for review.

## Flow D — News for you
Today card → "More for you" → topic chips (defaults from interests; student toggles; "Match my interests again") → stories newest first with source, date, Read ↗ and "Explain it simply" (Buddy, using only the story's facts). Topics with no stories say so.

## Flow E — Buddy home
Buddy tab → orb home (starters, last conversation, earlier chats) → a starter or typed message opens a new thread → "‹ Buddy" returns home; "New chat" starts fresh. Follow-ups inside a thread continue it.

## Copy guidelines
Second person, warm, short. "I'll always check with you." Avoid pressure, rankings, guilt, streaks, admissions talk.

You and Explore open the same optional preference editor. Saving reranks local catalog choices; a separate search action authorizes web work. Source excerpts and explicit checks accompany active partial candidates. Coming soon shows announced future openings outside active picks. The owner-only report and test job have no student navigation or exposed owner Secret. See [Scout](14-OPPORTUNITY-SCOUT.md).
