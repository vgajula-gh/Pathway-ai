import { addDays, dkey, minOf, sod } from './time.js';
import { expand, dayCapacity } from './schedule.js';
import { AvailabilityRules, CalEvent } from './types.js';
import { dueSoon, countdown } from './applications.js';
export type Nudge = { title: string; body: string; tab: 'explore' | 'today' | 'grow' };
export function nudgeAllowed(settings: { enabled: boolean; time: string; pausedUntil: Date | null }, events: CalEvent[], local: Date, instant: Date, test = false) {
  if (!settings.enabled || (settings.pausedUntil && settings.pausedUntil > instant)) return false;
  const minute = local.getHours() * 60 + local.getMinutes();
  if (minute < 7 * 60 || minute >= 21 * 60 || (!test && minute < minOf(settings.time))) return false;
  return !expand(events, sod(local), addDays(sod(local), 1)).some(e => e.type === 'class' && e.s <= local && e.e > local);
}
export function chooseNudge(input: { applications: { name: string; status: string; deadline: string | null }[]; events: CalEvent[]; rules: AvailabilityRules; pending: number; goals: { title: string }[]; now: Date }): Nudge | null {
  const { applications, events, rules, pending, goals, now } = input, today = dkey(now);
  const application = dueSoon(applications, today, 3)[0];
  if (application) return { title: 'A date to keep in mind', body: `${application.name.slice(0, 80)}: ${countdown(application.deadline, today)!.label.toLowerCase()}. Tap to review.`, tab: 'explore' };
  const tomorrow = addDays(sod(now), 1);
  const event = expand(events, tomorrow, addDays(tomorrow, 1)).find(e => ['exam', 'deadline'].includes(e.type));
  if (event) return { title: 'A little room to prepare', body: `${event.title.slice(0, 80)} is tomorrow. Tap to review your day.`, tab: 'today' };
  if (pending) return { title: 'Your choice', body: 'A suggested plan is waiting for your approval. Tap to review when you’re ready.', tab: 'today' };
  const cap = dayCapacity(events, rules, now), window = Math.max(1, minOf(rules.studyEnd) - minOf(rules.studyStart));
  if (goals[0] && cap.loadMin < window / 2) return { title: 'A small possibility', body: `There may be room for a small step toward “${goals[0].title.slice(0, 80)}”. Tap to explore.`, tab: 'grow' };
  return null;
}
