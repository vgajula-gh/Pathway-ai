import ical from 'node-ical';
import { createHash } from 'node:crypto';
import { addDays, dkey, fmtLocal, wallNow } from './time.js';
import { AvailabilityRules, CalEvent } from './types.js';
import { dayCapacity, expand, findConflicts } from './schedule.js';

const text = (value: unknown) => typeof value === 'string' ? value : String((value as { val?: unknown })?.val || '');
export function parseCalendar(body: string, timezone: string, eventType = 'class', instant = new Date()) {
  if (!body.includes('BEGIN:VCALENDAR') || !body.includes('END:VCALENDAR')) throw new Error('Not an iCalendar file');
  // Floating times belong to the calendar's declared zone or the student's zone.
  const zone = /^X-WR-TIMEZONE:(.+)$/m.exec(body)?.[1].trim() || timezone;
  new Intl.DateTimeFormat('en', { timeZone: zone });
  const normalized = body.replace(/^(DTSTART|DTEND|RECURRENCE-ID|EXDATE):((?:\d{8}T\d{6})(?:,\d{8}T\d{6})*)\r?$/gm, `$1;TZID=${zone}:$2`);
  const data = ical.sync.parseICS(normalized), from = new Date(+instant - 30 * 864e5), to = new Date(+instant + 180 * 864e5);
  const out: { importKey: string; title: string; start: string; end: string; type: string; location: string }[] = [];
  for (const raw of Object.values(data)) {
    if (!raw || raw.type !== 'VEVENT') continue;
    const event = raw as ical.VEvent;
    if (event.type !== 'VEVENT' || event.recurrenceid || event.status === 'CANCELLED') continue;
    const rule = (event.rrule as unknown as { origOptions?: Record<string, unknown> })?.origOptions;
    if (rule && (Number(rule.freq) >= 5 || ['bysecond', 'byminute', 'byhour'].some(k => Array.isArray(rule[k]) && (rule[k] as unknown[]).length > 1))) throw new Error('High-frequency recurrence is not supported');
    for (const occurrence of ical.expandRecurringEvent(event, { from, to, expandOngoing: true })) {
      const instance = occurrence as typeof occurrence & { event?: typeof event };
      if (instance.event?.status === 'CANCELLED') continue;
      const allDay = occurrence.isFullDay;
      const start = allDay ? occurrence.start.toISOString().slice(0, 10) + 'T00:00' : fmtLocal(wallNow(timezone, occurrence.start));
      const end = allDay ? start : fmtLocal(wallNow(timezone, occurrence.end));
      out.push({ importKey: createHash('sha256').update(event.uid + '|' + occurrence.start.toISOString()).digest('hex'), title: text(occurrence.summary).slice(0, 120) || 'Calendar event', start, end, type: allDay ? 'deadline' : eventType, location: text(event.location).slice(0, 120) });
      if (out.length > 3000) throw new Error('Too many calendar events');
    }
  }
  return out;
}
export function weekSummary(events: CalEvent[], rules: AvailabilityRules, from: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(from, i), occ = expand(events, day, addDays(day, 1)), cap = dayCapacity(events, rules, day);
    const window = Math.max(1, Number(rules.studyEnd.slice(0, 2)) * 60 + Number(rules.studyEnd.slice(3)) - Number(rules.studyStart.slice(0, 2)) * 60 - Number(rules.studyStart.slice(3)));
    const ratio = cap.loadMin / window;
    return { date: dkey(day), minutes: cap.loadMin, load: ratio < 0.5 ? 'light' : ratio < 1 ? 'busy' : 'heavy', clash: findConflicts(occ).length > 0, events: occ.map(o => ({ id: o.id, title: o.title, start: fmtLocal(o.s), end: fmtLocal(o.e), source: o.source, readOnly: o.readOnly || false })) };
  });
}
