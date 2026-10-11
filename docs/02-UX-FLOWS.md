# 02 · Information Architecture & UX Flows

## Navigation (mobile-first, top bar)
A sticky top bar holds the brand, an appearance toggle (Dusk → Dark → Light → Match device) and the profile avatar, with five section pills below. The Buddy composer stays at the bottom for thumb reach. Today has a floating "Talk to Buddy" orb.

| Tab | Pillar | Purpose |
|---|---|---|
| **Today** | Simplify | Calm snapshot: headline, 3 rings, insight, next best step, timeline, coming up |
| **Explore** | Discover | Opportunity shortlist with fit factors; detail sheet; save/compare/dismiss |
| **Buddy** | All | Conversation with tools; schedule scan; inline proposals |
| **Grow** | Grow/Prepare | Growth story, goals & steps, learning companion, portfolio |
| **You** | Trust | Student DNA with provenance, My Day settings, privacy, activity log, export/delete |

Secondary surfaces are **bottom sheets** (detail, review, forms). One primary action per card.

## Onboarding (6 screens, ~60 seconds)
1. Welcome — promise and orb.
2. "Your journey is yours" — decide / private / delete; **AI consent toggle**.
3. Name + grade.
4. Interests (chips).
5. Aspiration (optional, skippable).
6. Study window + protected downtime; optional labeled sample week.

## Flow A — Discover → verified reminder (the demo)
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
Warm sky card (gradient by time of day; greeting, daily encouraging line, one-line summary, "Get today's insight") → Today's spark (word of the day + News for you) → next best step → Your day at a glance (rings) → timeline → coming up.

## Flow D — News for you
Today card → "More for you" → topic chips (defaults from interests; student toggles; "Match my interests again") → stories newest first with source, date, Read ↗ and "Explain it simply" (Buddy, using only the story's facts). Topics with no stories say so.

## Flow E — Buddy home
Buddy tab → orb home (starters, last conversation, earlier chats) → a starter or typed message opens a new thread → "‹ Buddy" returns home; "New chat" starts fresh. Follow-ups inside a thread continue it.

## Copy guidelines
Second person, warm, short. "I'll always check with you." Avoid pressure, rankings, guilt, streaks, admissions talk.
