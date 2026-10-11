// Today screen: three transparent "rings" + headline + next best action.
// Rings show plain quantities (minutes, hours, steps) — never a judgment score.
import { addDays, dkey, minOf, mondayOf, sod } from './time.js';
import { dayCapacity, expand, findConflicts } from './schedule.js';
import { AvailabilityRules, CalEvent } from './types.js';

export interface MilestoneLite { id: string; title: string; status: string; targetDate: string; doneAt?: Date | null }

export function todayMetrics(events: CalEvent[], rules: AvailabilityRules, milestones: MilestoneLite[], now = new Date()) {
  const cap = dayCapacity(events, rules, now);
  const prot = Math.max(0, minOf(rules.downtimeEnd) - minOf(rules.downtimeStart));
  const win = Math.max(1, minOf(rules.studyEnd) - minOf(rules.studyStart));
  const free = cap.freeMin + prot;
  const w0 = mondayOf(now), w1 = addDays(w0, 7), k0 = dkey(w0), k1 = dkey(addDays(w1, -1));
  const wk = milestones.filter(m => (m.targetDate && m.targetDate >= k0 && m.targetDate <= k1) || (m.doneAt && +m.doneAt >= +w0 && +m.doneAt < +w1));
  const done = wk.filter(m => m.status === 'done').length;
  return {
    focus: { label: 'Focus', minutes: cap.studyMin, limit: rules.maxStudyMin, pct: cap.studyMin / rules.maxStudyMin, status: cap.studyMin === 0 ? 'Open' : cap.overStudy ? 'Too much' : 'On track' },
    freeTime: { label: 'Free time', minutes: free, inWindow: cap.freeMin, downtime: prot, pct: free / (win + prot), status: free >= 180 ? 'Plenty' : free >= 90 ? 'Some' : 'Tight' },
    progress: { label: 'Progress', done, planned: wk.length, pct: wk.length ? done / wk.length : 0, status: !wk.length ? 'No steps yet' : done / wk.length >= 0.6 ? 'Moving' : 'Building' },
    capacity: cap
  };
}

export function headline(events: CalEvent[], rules: AvailabilityRules, now = new Date()) {
  const occ = expand(events, sod(now), addDays(sod(now), 1));
  if (findConflicts(occ).some(c => c.kind === 'overlap')) return 'A day with one thing to untangle';
  if (dayCapacity(events, rules, now).loadMin > 480) return 'A full day. Pace yourself.';
  return occ.length ? 'A balanced day ahead' : 'An open day, all yours';
}

/** Deterministic nudges for the next 7 days (limited to avoid notification fatigue). */
export function nudges(events: CalEvent[], rules: AvailabilityRules, milestones: MilestoneLite[], now = new Date()) {
  const out: { tone: 'warn' | 'soon' | 'info'; title: string; body: string; ask?: string }[] = [];
  for (const o of expand(events, now, addDays(now, 3))) if (['exam', 'deadline', 'competition'].includes(o.type))
    out.push({ tone: 'soon', title: `${o.title} is coming up`, body: o.s.toDateString(), ask: `Help me prepare for "${o.title}" on ${o.s.toDateString()} without crowding my weekend.` });
  const wk = addDays(sod(now), 7);
  for (const c of findConflicts(expand(events, sod(now), wk)).filter(c => c.kind === 'overlap').slice(0, 2))
    out.push({ tone: 'warn', title: `${c.a.title} overlaps ${c.b.title}`, body: c.b.s.toDateString(), ask: `"${c.a.title}" and "${c.b.title}" overlap on ${c.b.s.toDateString()}. Help me decide and propose a fix.` });
  const today = dkey(now);
  for (const m of milestones) if (m.status !== 'done' && m.targetDate && m.targetDate < today) out.push({ tone: 'warn', title: `Overdue: ${m.title}`, body: `Was due ${m.targetDate}`, ask: `My step "${m.title}" is overdue. Help me replan it realistically.` });
  return out.slice(0, 3);
}
