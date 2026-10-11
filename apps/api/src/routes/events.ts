import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { loadContext, toCalEvent } from '../lib/context.js';
import { addDays, fmtLocal, parseLocal, sod } from '../domain/time.js';
import { checkSessions, expand, findConflicts } from '../domain/schedule.js';
import { EVENT_TYPES } from '../domain/types.js';

const localDT = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const NewEvent = z.object({ title: z.string().min(1).max(120), type: z.enum(EVENT_TYPES), start: localDT, end: localDT, location: z.string().max(120).default(''), recurDays: z.array(z.number().int().min(0).max(6)).default([]), recurUntil: z.string().default(''), force: z.boolean().default(false) });
const Bulk = z.object({ source: z.string().default('upload'), events: z.array(NewEvent.omit({ force: true }).extend({ confidence: z.string().default('') })).min(1).max(60) });

function ics(e: { id: string; title: string; start: string; end: string; location: string; recurDays: string; recurUntil: string }, withLocation: boolean) {
  const f = (s: string) => s.replace(/[-:]/g, '') + '00', esc = (t: string) => t.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const days: number[] = JSON.parse(e.recurDays || '[]'); const end = e.end > e.start ? e.end : fmtLocal(new Date(+parseLocal(e.start)! + 30 * 6e4));
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pathway AI//EN', 'BEGIN:VEVENT', `UID:${e.id}@pathway`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${f(e.start)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(e.title)}`];
  if (withLocation && e.location) L.push(`LOCATION:${esc(e.location)}`);
  if (days.length) L.push(`RRULE:FREQ=WEEKLY;BYDAY=${days.map(d => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]).join(',')}${e.recurUntil ? ';UNTIL=' + e.recurUntil.replace(/-/g, '') + 'T235959' : ''}`);
  return [...L, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

export default async function routes(app: FastifyInstance) {
  app.get('/api/events', async req => {
    const s = await requireStudent(req), q = req.query as { from?: string; to?: string };
    const from = parseLocal(q.from) || sod(new Date()), to = addDays(parseLocal(q.to) || addDays(from, 6), 1);
    const { events } = await loadContext(s.id), occ = expand(events, from, to);
    const clash = new Set(findConflicts(occ).filter(c => c.kind === 'overlap').flatMap(c => [c.a.id + (c.a.occ || ''), c.b.id + (c.b.occ || '')]));
    return occ.map(o => ({ id: o.id, title: o.title, type: o.type, start: fmtLocal(o.s), end: fmtLocal(o.e), location: o.location, recurring: o.recurDays.length > 0, source: o.source, done: o.done, clash: clash.has(o.id + (o.occ || '')) }));
  });

  app.post('/api/events', async (req, reply) => {
    const s = await requireStudent(req), b = NewEvent.parse(req.body);
    if (b.end < b.start) throw new HttpError(422, 'End is before start');
    if (!b.force && !b.recurDays.length) { const { events, rules } = await loadContext(s.id); const r = checkSessions(events, rules, [{ title: b.title, type: b.type, start: b.start, end: b.end > b.start ? b.end : b.start }]); if (b.end > b.start && r.problems.length) return reply.code(409).send({ warning: r.problems[0].issue }); }
    const e = await prisma.event.create({ data: { studentId: s.id, title: b.title, type: b.type, start: b.start, end: b.end, location: b.location, recurDays: JSON.stringify(b.recurDays), recurUntil: b.recurUntil, source: 'manual' } });
    await audit(s.id, 'student', 'Added event', b.title);
    return reply.code(201).send(toCalEvent(e));
  });

  // Only events the student reviewed and confirmed in the extraction preview.
  app.post('/api/events/bulk', async (req, reply) => {
    const s = await requireStudent(req), b = Bulk.parse(req.body);
    await prisma.event.createMany({ data: b.events.map(e => ({ studentId: s.id, title: e.title, type: e.type, start: e.start, end: e.end, location: e.location, recurDays: JSON.stringify(e.recurDays), recurUntil: e.recurUntil, source: b.source, confidence: e.confidence })) });
    await audit(s.id, 'student', `Imported ${b.events.length} events`);
    return reply.code(201).send({ created: b.events.length });
  });

  app.patch('/api/events/:id', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string }, b = z.object({ done: z.boolean() }).parse(req.body);
    const e = await prisma.event.findFirst({ where: { id, studentId: s.id } }); if (!e) throw new HttpError(404, 'Not found');
    await audit(s.id, 'student', b.done ? 'Marked done' : 'Marked not done', e.title);
    return toCalEvent(await prisma.event.update({ where: { id }, data: { done: b.done } }));
  });

  app.delete('/api/events/:id', async (req, reply) => {
    const s = await requireStudent(req), { id } = req.params as { id: string };
    const e = await prisma.event.findFirst({ where: { id, studentId: s.id } }); if (!e) throw new HttpError(404, 'Not found');
    await prisma.event.delete({ where: { id } }); await audit(s.id, 'student', 'Deleted event', e.title);
    return reply.code(204).send();
  });

  // Calendar file for the student's own phone calendar. Downloading is the student's explicit action.
  app.get('/api/events/:id/ics', async (req, reply) => {
    const s = await requireStudent(req), { id } = req.params as { id: string }, q = req.query as { location?: string };
    const e = await prisma.event.findFirst({ where: { id, studentId: s.id } }); if (!e) throw new HttpError(404, 'Not found');
    await audit(s.id, 'student', 'Downloaded calendar file', e.title);
    return reply.header('content-type', 'text/calendar').header('content-disposition', `attachment; filename="${e.title.replace(/[^\w-]+/g, '-')}.ics"`).send(ics(e, q.location !== 'false'));
  });
}
