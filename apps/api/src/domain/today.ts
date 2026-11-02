import { addDays, dkey, sod } from './time.js';
import { expand } from './schedule.js';
import { countdown } from './applications.js';
import type { CalEvent } from './types.js';

export function dueEvents(events: CalEvent[], now: Date, within = 7) {
  const today = dkey(now);
  return expand(events, sod(now), addDays(sod(now), within + 1))
    .filter(o => ['exam', 'deadline'].includes(o.type) && !o.done && +o.e >= +now)
    .map(o => ({ id:o.id, title:o.title, type:o.type, date:dkey(o.s), countdown:countdown(dkey(o.s), today)! }))
    .filter(o => o.countdown.days >= 0 && o.countdown.days <= within)
    .sort((a,b) => a.date.localeCompare(b.date));
}
export function greetingPart(now: Date) {
  const hour = now.getHours();
  return hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
}
