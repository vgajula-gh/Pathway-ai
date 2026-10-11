// Deterministic calendar engine. AI never does date math — it calls these via tools.
import { addDays, dkey, fmtLocal, minOf, parseLocal, sod } from './time.js';
import { AvailabilityRules, CalEvent, FIXED, Occurrence } from './types.js';

/** Expand events (including weekly recurrence) into concrete occurrences in [from, to). */
export function expand(events: CalEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    const s = parseLocal(e.start); const en = parseLocal(e.end) || s;
    if (!s || !en) continue;
    const dur = Math.max(0, +en - +s);
    if (!e.recurDays?.length) {
      if ((+en > +from || (dur === 0 && s >= from)) && s < to) out.push({ ...e, s, e: new Date(+s + dur) });
      continue;
    }
    const until = e.recurUntil ? addDays(parseLocal(e.recurUntil)!, 1) : to;
    for (let d = sod(from > s ? from : s); d < to && d < until; d = addDays(d, 1)) {
      if (!e.recurDays.includes(d.getDay())) continue;
      const os = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.getHours(), s.getMinutes());
      if (os < sod(s)) continue;
      out.push({ ...e, s: os, e: new Date(+os + dur), occ: dkey(d) });
    }
  }
  return out.sort((a, b) => +a.s - +b.s);
}

/** Protected downtime as virtual occurrences. */
export function downtime(rules: AvailabilityRules, from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (let d = sod(from); d < to; d = addDays(d, 1)) {
    const s = new Date(+d + minOf(rules.downtimeStart) * 6e4), e = new Date(+d + minOf(rules.downtimeEnd) * 6e4);
    if (+e > +from && s < to) out.push({ id: 'downtime', title: 'Downtime', type: 'downtime', start: fmtLocal(s), end: fmtLocal(e), recurDays: [], s, e });
  }
  return out;
}

export interface Conflict { a: Occurrence; b: Occurrence; kind: 'overlap' | 'downtime' }
/** Overlaps between occurrences. Exams/deadlines inside class time are expected and ignored. */
export function findConflicts(occ: Occurrence[]): Conflict[] {
  const list = [...occ].sort((a, b) => +a.s - +b.s), out: Conflict[] = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (+a.e - +a.s <= 0) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]; if (b.s >= a.e) break; if (+b.e - +b.s <= 0) continue;
      if (a.type === 'downtime' && b.type === 'downtime') continue;
      const classExam = (x: Occurrence, y: Occurrence) => x.type === 'class' && ['exam', 'deadline'].includes(y.type);
      if (classExam(a, b) || classExam(b, a)) continue;
      const dt = a.type === 'downtime' || b.type === 'downtime';
      if (dt) { const ev = a.type === 'downtime' ? b : a; if (FIXED[ev.type]) continue; }
      out.push({ a, b, kind: dt ? 'downtime' : 'overlap' });
    }
  }
  return out;
}

export interface DayCapacity { date: string; freeMin: number; studyMin: number; budget: number; available: number; loadMin: number; overStudy: boolean; free: [number, number][] }
/** Free minutes inside the study window, study already planned, and remaining study budget. */
export function dayCapacity(events: CalEvent[], rules: AvailabilityRules, day: Date, extra: Occurrence[] = []): DayCapacity {
  const from = sod(day), to = addDays(from, 1);
  const occ = [...expand(events, from, to), ...downtime(rules, from, to), ...extra.filter(o => o.s >= from && o.s < to)];
  const winS = +from + minOf(rules.studyStart) * 6e4, winE = +from + minOf(rules.studyEnd) * 6e4;
  const busy = occ.filter(o => +o.e > +o.s).map(o => [Math.max(+o.s, winS), Math.min(+o.e, winE)] as [number, number]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of busy) { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else merged.push([...iv]); }
  const free: [number, number][] = []; let cur = winS;
  for (const [s, e] of merged) { if (s > cur) free.push([cur, s]); cur = Math.max(cur, e); }
  if (winE > cur) free.push([cur, winE]);
  const studyMin = occ.filter(o => o.type === 'study').reduce((t, o) => t + (+o.e - +o.s) / 6e4, 0);
  const loadMin = occ.filter(o => o.type !== 'downtime').reduce((t, o) => t + (+o.e - +o.s) / 6e4, 0);
  const freeMin = free.reduce((t, [s, e]) => t + (e - s) / 6e4, 0);
  const budget = Math.max(0, rules.maxStudyMin - studyMin);
  return { date: dkey(from), free, freeMin: Math.round(freeMin), studyMin: Math.round(studyMin), budget: Math.round(budget), available: Math.round(Math.min(freeMin, budget)), loadMin: Math.round(loadMin), overStudy: studyMin > rules.maxStudyMin };
}

/** Find open slots of `minutes` length, at most 2 per day, never in the past. */
export function freeSlots(events: CalEvent[], rules: AvailabilityRules, fromKey: string, toKey: string, minutes: number, count: number, now = new Date()) {
  minutes = Math.max(15, Math.min(240, Math.round(minutes || 45))); count = Math.max(1, Math.min(14, Math.round(count || 5)));
  const from = parseLocal(fromKey) || sod(now), to = addDays(parseLocal(toKey) || addDays(from, 7), 1), out: { start: string; end: string }[] = [];
  for (let d = sod(from); d < to && out.length < count; d = addDays(d, 1)) {
    const cap = dayCapacity(events, rules, d); let budget = cap.budget, perDay = 0;
    for (let [s, e] of cap.free) {
      if (e <= +now) continue; if (s < +now) s = Math.ceil(+now / 9e5) * 9e5;
      while (e - s >= minutes * 6e4 && budget >= minutes && perDay < 2 && out.length < count) {
        out.push({ start: fmtLocal(new Date(s)), end: fmtLocal(new Date(s + minutes * 6e4)) });
        s += (minutes + 30) * 6e4; budget -= minutes; perDay++;
      }
    }
  }
  return out;
}

export interface Session { title: string; type?: string; start: string; end: string }
/** Validate proposed blocks against the calendar, downtime, each other and the daily study limit. */
export function checkSessions(events: CalEvent[], rules: AvailabilityRules, sessions: Session[]) {
  const ok: Session[] = [], problems: { session: Session; issue: string }[] = [], placed: Occurrence[] = [];
  for (const x of sessions) {
    const s = parseLocal(x.start), e = parseLocal(x.end);
    if (!s || !e || e <= s) { problems.push({ session: x, issue: 'Invalid start or end time' }); continue; }
    const from = sod(s), to = addDays(from, 1);
    const me: Occurrence = { id: 'new', title: x.title, type: x.type || 'study', start: x.start, end: x.end, recurDays: [], s, e };
    const occ = [...expand(events, from, to), ...downtime(rules, from, to), ...placed, me];
    const hits = findConflicts(occ).filter(c => c.a === me || c.b === me).map(c => (c.a === me ? c.b : c.a));
    if (hits.length) { problems.push({ session: x, issue: 'Overlaps ' + hits.map(h => h.title).join(', ') }); continue; }
    if (me.type === 'study') { const cap = dayCapacity(events, rules, s, placed); if ((+e - +s) / 6e4 > cap.budget) { problems.push({ session: x, issue: `Exceeds the ${rules.maxStudyMin}-minute daily study limit` }); continue; } }
    placed.push(me); ok.push(x);
  }
  return { ok, problems };
}
