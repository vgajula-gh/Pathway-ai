// Loads everything the deterministic engine needs for one student.
import { prisma, j } from './db.js';
import { AvailabilityRules, CalEvent, StudentContext } from '../domain/types.js';

export const DEFAULT_RULES: AvailabilityRules = { studyStart: '16:00', studyEnd: '21:00', maxStudyMin: 120, downtimeStart: '21:00', downtimeEnd: '23:00' };

export function toCalEvent(e: { id: string; title: string; type: string; start: string; end: string; location: string; recurDays: string; recurUntil: string; source: string; done: boolean; readOnly?: boolean }): CalEvent {
  return { id: e.id, title: e.title, type: e.type, start: e.start, end: e.end, location: e.location, recurDays: j<number[]>(e.recurDays, []), recurUntil: e.recurUntil, source: e.source, done: e.done, readOnly: e.readOnly };
}

export async function loadContext(studentId: string) {
  const [student, events, goals] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { availability: true } }),
    prisma.event.findMany({ where: { studentId } }),
    prisma.goal.findMany({ where: { studentId }, include: { milestones: true } })
  ]);
  const a = student.availability;
  const rules: AvailabilityRules = a ? { studyStart: a.studyStart, studyEnd: a.studyEnd, maxStudyMin: a.maxStudyMin, downtimeStart: a.downtimeStart, downtimeEnd: a.downtimeEnd } : DEFAULT_RULES;
  const ctx: StudentContext = { timezone:student.timezone, region: student.region, grade: student.grade, interests: j(student.interests, []), skills: j(student.skills, []), budget: student.budget, format: student.format, goals: goals.filter(g => g.status !== 'done').map(g => g.title) };
  return { student, rules, events: events.map(toCalEvent), goals, ctx, milestones: goals.flatMap(g => g.milestones) };
}
