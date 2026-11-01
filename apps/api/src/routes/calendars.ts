import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { calendarView, encryptCalendarUrl, syncCalendar } from '../lib/calendars.js';
import { weekSummary } from '../domain/calendars.js';
import { CalendarDate } from '../domain/applications.js';
import { loadContext } from '../lib/context.js';
import { dkey, parseLocal, wallNow, sod } from '../domain/time.js';
import { audit } from '../lib/audit.js';
export default async function routes(app: FastifyInstance) {
  app.get('/api/calendars', async req => { const s = await requireStudent(req); return (await prisma.calendarLink.findMany({ where: { studentId: s.id } })).map(calendarView); });
  app.post('/api/calendars', async (req, reply) => {
    const s = await requireStudent(req), b = z.object({ label: z.string().trim().min(1).max(50), url: z.string().max(4096), eventType: z.enum(['class', 'personal', 'other']).default('class') }).parse(req.body);
    if (await prisma.calendarLink.count({ where: { studentId: s.id } }) >= 10) throw new HttpError(422, 'You can link up to ten calendars.');
    let encrypted;
    try { encrypted = encryptCalendarUrl(b.url); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(422, 'Use a valid private HTTPS iCalendar link.'); }
    const c = await prisma.calendarLink.create({ data: { studentId: s.id, label: b.label, eventType: b.eventType, ...encrypted } });
    await audit(s.id, 'student', 'Linked read-only calendar', b.label); await syncCalendar(c.id);
    return reply.code(201).send(calendarView(await prisma.calendarLink.findUniqueOrThrow({ where: { id: c.id } })));
  });
  app.post('/api/calendars/:id/sync', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string };
    const c = await prisma.calendarLink.findFirst({ where: { id, studentId: s.id } }); if (!c) throw new HttpError(404, 'Calendar not found');
    if (c.lastSync && +new Date() - +c.lastSync < 30000) throw new HttpError(429, 'This calendar just synced. Try again in a moment.');
    await syncCalendar(id); return calendarView(await prisma.calendarLink.findUniqueOrThrow({ where: { id } }));
  });
  app.delete('/api/calendars/:id', async (req, reply) => {
    const s = await requireStudent(req), { id } = req.params as { id: string };
    const c = await prisma.calendarLink.findFirst({ where: { id, studentId: s.id } }); if (!c) throw new HttpError(404, 'Calendar not found');
    await prisma.calendarLink.delete({ where: { id } }); await audit(s.id, 'student', 'Removed calendar and its imported events', c.label); return reply.code(204).send();
  });
  app.get('/api/week', async req => {
    const s = await requireStudent(req), q = z.object({ from: CalendarDate.optional() }).parse(req.query);
    const { events, rules } = await loadContext(s.id);
    return weekSummary(events, rules, sod(parseLocal(q.from || dkey(wallNow(s.timezone)))!));
  });
}
