import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, j } from '../lib/db.js';
import { requireStudent } from '../lib/auth.js';
import { accessCode } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { sampleWeek } from '../lib/sample.js';

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const Onboard = z.object({ name: z.string().min(1).max(60), grade: z.number().int().min(9).max(12), interests: z.array(z.string()).max(20).default([]), goal: z.string().max(140).optional(),
  aiConsent: z.boolean().default(true), timezone: z.string().default('America/New_York'), studyStart: hhmm.default('16:00'), studyEnd: hhmm.default('21:00'), downtimeStart: hhmm.default('21:00'), downtimeEnd: hhmm.default('23:00'), sampleWeek: z.boolean().default(false) });
const Patch = z.object({ name: z.string().min(1).max(60), grade: z.number().int().min(9).max(12), interests: z.array(z.string()), skills: z.array(z.string()), location: z.string().max(80), aiConsent: z.boolean(), budget: z.enum(['free', 'any']), format: z.enum(['virtual', 'any']),
  settings: z.object({ voice: z.boolean(), showWord: z.boolean(), showNews: z.boolean(), theme: z.enum(['dusk', 'dark', 'light', 'auto']), newsTopics: z.array(z.string()).max(7).nullable() }).partial(), availability: z.object({ studyStart: hhmm, studyEnd: hhmm, maxStudyMin: z.number().int().min(30).max(360), downtimeStart: hhmm, downtimeEnd: hhmm }).partial() }).partial();

export function serializeStudent(s: any) {
  return { id: s.id, name: s.name, grade: s.grade, timezone: s.timezone, location: s.location, interests: j(s.interests, []), skills: j(s.skills, []), aiConsent: s.aiConsent, budget: s.budget, format: s.format, settings: { voice: false, showWord: true, showNews: true, theme: 'dusk', newsTopics: null, ...j(s.settings, {}) }, provenance: j(s.provenance, {}), availability: s.availability, createdAt: s.createdAt };
}

export default async function routes(app: FastifyInstance) {
  app.post('/api/students', async (req, reply) => {
    const b = Onboard.parse(req.body), at = new Date().toISOString(), src = 'You told me during setup';
    const s = await prisma.student.create({ data: { accessCode: accessCode(req), name: b.name, grade: b.grade, timezone: b.timezone, interests: JSON.stringify(b.interests), aiConsent: b.aiConsent,
      provenance: JSON.stringify({ grade: { src, at }, interests: { src, at }, availability: { src, at } }),
      availability: { create: { studyStart: b.studyStart, studyEnd: b.studyEnd, downtimeStart: b.downtimeStart, downtimeEnd: b.downtimeEnd } } }, include: { availability: true } });
    if (b.goal?.trim()) await prisma.goal.create({ data: { studentId: s.id, title: b.goal.trim(), priority: 'high' } });
    if (b.sampleWeek) await prisma.event.createMany({ data: sampleWeek(s.id) });
    await audit(s.id, 'student', 'Finished setup');
    return reply.code(201).send(serializeStudent(s));
  });

  app.get('/api/me', async req => serializeStudent(await requireStudent(req)));

  app.patch('/api/me', async req => {
    const s = await requireStudent(req), b = Patch.parse(req.body), prov = j<Record<string, unknown>>(s.provenance, {}), at = new Date().toISOString(), src = 'You edited';
    if (b.interests) prov.interests = { src, at }; if (b.skills) prov.skills = { src, at }; if (b.availability) prov.availability = { src, at };
    await prisma.student.update({ where: { id: s.id }, data: { name: b.name, grade: b.grade, location: b.location, aiConsent: b.aiConsent, budget: b.budget, format: b.format,
      interests: b.interests && JSON.stringify(b.interests), skills: b.skills && JSON.stringify(b.skills), settings: b.settings && JSON.stringify({ ...j(s.settings, {}), ...b.settings }), provenance: JSON.stringify(prov) } });
    if (b.availability) await prisma.availability.upsert({ where: { studentId: s.id }, update: { ...b.availability, source: 'edited', lastVerified: new Date() }, create: { studentId: s.id, ...b.availability } });
    if (b.aiConsent !== undefined) await audit(s.id, 'student', b.aiConsent ? 'Turned on AI help' : 'Turned off AI help');
    else if (b.settings?.voice !== undefined) await audit(s.id, 'student', b.settings.voice ? 'Turned on Voice' : 'Turned off Voice');
    else if (b.settings?.newsTopics !== undefined) await audit(s.id, 'student', 'Changed news topics', (b.settings.newsTopics || ['match interests']).join(', '));
    else await audit(s.id, 'student', 'Edited profile');
    return serializeStudent(await requireStudent(req));
  });

  app.get('/api/me/export', async req => {
    const s = await requireStudent(req);
    const [events, goals, portfolio, saved, proposals, audits] = await Promise.all([prisma.event.findMany({ where: { studentId: s.id } }), prisma.goal.findMany({ where: { studentId: s.id }, include: { milestones: true } }),
      prisma.portfolioEntry.findMany({ where: { studentId: s.id } }), prisma.savedOpportunity.findMany({ where: { studentId: s.id } }), prisma.agentAction.findMany({ where: { studentId: s.id } }), prisma.auditEvent.findMany({ where: { studentId: s.id } })]);
    await audit(s.id, 'student', 'Exported all data');
    return { exportedAt: new Date().toISOString(), profile: { ...serializeStudent(s), accessCode: s.accessCode }, events, goals, portfolio, saved, proposals, activity: audits };
  });

  app.delete('/api/me', async (req, reply) => { const s = await requireStudent(req); await prisma.$transaction([
    prisma.aIUsage.deleteMany({ where: { key: { startsWith: 'day:', endsWith: `:${s.id}` } } }),
    prisma.student.delete({ where: { id: s.id } })
  ]); return reply.code(204).send(); });
}
