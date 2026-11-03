import { addDays, dkey, fmtLocal, sod } from './time.js';
import { expand, findConflicts } from './schedule.js';
import { countdown } from './applications.js';
import type { CalEvent, Occurrence } from './types.js';

/** Shared event details for Today and the weekly agenda. */
export function timelineItems(occ:Occurrence[]) {
  const clash=new Set(findConflicts(occ).filter(c=>c.kind==='overlap').flatMap(c=>[c.a.id,c.b.id]));
  return occ.map(o=>({id:o.id,title:o.title,type:o.type,start:fmtLocal(o.s),end:fmtLocal(o.e),source:o.source||'manual',done:!!o.done,readOnly:!!o.readOnly,recurring:o.recurDays.length>0,clash:clash.has(o.id)}));
}

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
