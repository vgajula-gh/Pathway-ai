import { z } from 'zod';
import { addDays, dkey, parseLocal } from './time.js';
import { freeSlots } from './schedule.js';
import { AvailabilityRules, CalEvent } from './types.js';

export const ApplicationStatus = z.enum(['interested', 'preparing', 'applied', 'result']);
export const Checklist = z.array(z.object({ title: z.string().trim().min(1).max(300), done: z.boolean() })).max(40);
export const CalendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = parseLocal(s); return !!d && dkey(d) === s; }, 'Use a real calendar date');
export const ApplicationPatch = z.object({ status: ApplicationStatus.optional(), deadline: CalendarDate.nullable().optional(), notes: z.string().max(4000).optional(), checklist: Checklist.optional() });
export function initialChecklist(checks: string[]) { return [...new Set([...checks, 'Confirm deadline on the official site'])].slice(0, 40).map(title => ({ title, done: false })); }
export function countdown(deadline: string | null, today: string) {
  if (!deadline) return null;
  const days = Math.round((Date.parse(deadline + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  return { days, label: days < 0 ? 'Deadline passed' : days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} left` };
}
export function dueSoon<T extends { deadline: string | null; status: string }>(applications: T[], today: string, within = 7) {
  return applications.filter(a => ['saved', 'interested', 'preparing'].includes(a.status) && a.deadline && countdown(a.deadline, today)!.days >= 0 && countdown(a.deadline, today)!.days <= within).sort((a, b) => a.deadline!.localeCompare(b.deadline!));
}
export function prepActions(name: string, deadline: string, events: CalEvent[], rules: AvailabilityRules, now: Date) {
  const end = [dkey(addDays(parseLocal(deadline)!, -1)), dkey(addDays(now, 30))].sort()[0];
  if (end < dkey(now)) return [];
  const working = [...events];
  const actions: { type: 'add_event'; title: string; eventType: 'reminder' | 'study'; start: string; end: string }[] = [];
  for (const [minutes, count, eventType] of [[15, 1, 'reminder'], [30, 3, 'study']] as const) {
    const slots = freeSlots(working, rules, dkey(now), end, minutes, count, now);
    for (const slot of slots) {
      const title = `${eventType === 'reminder' ? 'Check application details' : 'Application prep'}: ${name}`.slice(0, 120);
      actions.push({ type: 'add_event', title, eventType, ...slot });
      working.push({ id: `prep-${actions.length}`, title, type: eventType, ...slot, recurDays: [] });
    }
  }
  return actions;
}
