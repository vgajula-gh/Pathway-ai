# 03 · Design System — "calm companion" (Oura-inspired)

Dark-first, soft glow, rings with contributors, editorial serif for insights. Light mode follows the device.

## Tokens (see `apps/web/src/styles/app.css`)
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | #080A13 | #F3F2F8 | page |
| `--card` | rgba(255,255,255,.055) | rgba(255,255,255,.78) | glass cards |
| `--text` / `--text2` | #ECEEF7 / #A0A6BE | #16152A / #5D5B73 | type |
| `--peri` | #9DAFFF | #4E62D6 | Focus ring, links |
| `--teal` | #6FD8C4 | #13897A | Free time ring, success |
| `--peach` | #F5BE8C | #B8641F | Progress ring, attention |
| `--rose` | #FF8FA3 | #C2405A | overlaps, destructive |
| `--glow` | per tab | per tab | background radial glow (Today blue, Explore teal, Grow peach, Buddy violet) |

## Appearance modes
`data-theme` on `<html>`: **dusk** (default, softly dark navy #161A2C), **dark** (#080A13), **light** (#F3F2F8), or removed for "match device". Stored in `Student.settings.theme`.

## Signature elements
- **Sky card** — Today's welcome; gradients: morning peach→rose, afternoon sky→periwinkle, evening peach→violet, night indigo.
- **Orb** — Buddy's identity: radial white→periwinkle→teal with glow; "breathes" (scale 1→1.06, 4.5s) unless reduced motion.

## Type
- **Fraunces** 300/400 (serif) — headlines, insight sentences, big words. Fallback Georgia.
- **Instrument Sans** 400–600 — UI. Fallback system-ui.
- Scale: 36 display · 24 card title · 20 lead · 16 body · 13 labels (letter-spaced caps for section labels only).

## Components
- **Ring** — thin stroke + soft drop-shadow glow; value centered; label + status word below. Tap → contributors sheet with explanation. *Rings show quantities, never a 0–100 judgment score.*
- **Next best step card** — dot + label, serif title, why, actions: Do it · Later · Why this?
- **Timeline** — time, glowing dot (rose on overlap), title with emoji, source tag (You added · Imported · Suggested · Sample), check for flexible items.
- **Timeline views** — Today/Week pressed-button toggle; vertical seven-day agenda with dated selectable headers, Today/Selected labels, week navigation and empty-day copy. Use existing card/chip colors, 44px targets and wrapping titles; no horizontal calendar grid on phones. Completed titles are crossed out in both views.
- **Timeline deletion** — small circled minus at the end of writable rows, accessible Delete event label and 44px target; confirm the event/whole series before removing. Stack beside completion controls to preserve phone title width.
- **Extra sparks** — Next word / Today’s word and Next story / Refresh news reuse chip buttons with 44px targets; practice/news updates announce changes and retain current content during errors.
- **Opportunity card** — category emoji, fit pill (Strong/Good/Worth a look), why line, factor dots (Interests · Eligible · Time · Cost · Ready), footer Save · Compare · Not for me.
- **Review sheet** — What will happen · Info used · What changes · step chips Proposed → Approved → Saving → Verified.
- **Bottom sheet** — grabber, centered title, Cancel/Done; spring slide-up; disabled with reduced motion.

## Rules
One primary action per card · 44px minimum targets · 4.5:1 text contrast · color never the only signal (status words accompany ring colors) · motion ≤ 400ms.
