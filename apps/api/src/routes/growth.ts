import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, j } from '../lib/db.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { audit } from '../lib/audit.js';

const NewEntry = z.object({ title: z.string().min(1).max(140), type: z.string().default('project'), date: z.string(), reflection: z.string().max(4000).default(''), skills: z.array(z.string()).default([]), evidence: z.string().max(500).default(''), visibility: z.enum(['private', 'shared']).default('private') });

export default async function routes(app: FastifyInstance) {
  app.get('/api/goals', async req => { const s = await requireStudent(req); return prisma.goal.findMany({ where: { studentId: s.id }, include: { milestones: true }, orderBy: { createdAt: 'asc' } }); });
  app.post('/api/goals', async (req, reply) => { const s = await requireStudent(req), b = z.object({ title: z.string().min(1).max(140), category: z.string().default('aspiration') }).parse(req.body);
    const g = await prisma.goal.create({ data: { studentId: s.id, ...b }, include: { milestones: true } }); await audit(s.id, 'student', 'Added goal', g.title); return reply.code(201).send(g); });
  app.patch('/api/goals/:id', async req => { const s = await requireStudent(req), { id } = req.params as { id: string }, b = z.object({ status: z.enum(['active', 'done']) }).parse(req.body);
    const g = await prisma.goal.findFirst({ where: { id, studentId: s.id } }); if (!g) throw new HttpError(404, 'Not found');
    await audit(s.id, 'student', b.status === 'done' ? 'Reached goal' : 'Reopened goal', g.title);
    return prisma.goal.update({ where: { id }, data: { status: b.status, doneAt: b.status === 'done' ? new Date() : null }, include: { milestones: true } }); });
  app.delete('/api/goals/:id', async (req, reply) => { const s = await requireStudent(req), { id } = req.params as { id: string };
    const g = await prisma.goal.findFirst({ where: { id, studentId: s.id } }); if (!g) throw new HttpError(404, 'Not found');
    await prisma.goal.delete({ where: { id } }); await audit(s.id, 'student', 'Deleted goal', g.title); return reply.code(204).send(); });
  app.patch('/api/milestones/:id', async req => { const s = await requireStudent(req), { id } = req.params as { id: string }, b = z.object({ status: z.enum(['todo', 'done']) }).parse(req.body);
    const m = await prisma.milestone.findFirst({ where: { id, goal: { studentId: s.id } } }); if (!m) throw new HttpError(404, 'Not found');
    await audit(s.id, 'student', b.status === 'done' ? 'Finished step' : 'Reopened step', m.title);
    return prisma.milestone.update({ where: { id }, data: { status: b.status, doneAt: b.status === 'done' ? new Date() : null } }); });

  app.get('/api/portfolio', async req => { const s = await requireStudent(req); return (await prisma.portfolioEntry.findMany({ where: { studentId: s.id }, orderBy: { date: 'desc' } })).map(p => ({ ...p, skills: j(p.skills, []) })); });
  app.post('/api/portfolio', async (req, reply) => { const s = await requireStudent(req), b = NewEntry.parse(req.body);
    const p = await prisma.portfolioEntry.create({ data: { studentId: s.id, ...b, skills: JSON.stringify(b.skills) } }); await audit(s.id, 'student', 'Captured experience', p.title); return reply.code(201).send({ ...p, skills: b.skills }); });
  app.patch('/api/portfolio/:id', async req => { const s = await requireStudent(req), { id } = req.params as { id: string }, b = z.object({ visibility: z.enum(['private', 'shared']) }).parse(req.body);
    const p = await prisma.portfolioEntry.findFirst({ where: { id, studentId: s.id } }); if (!p) throw new HttpError(404, 'Not found');
    await audit(s.id, 'student', b.visibility === 'shared' ? 'Marked shared with family' : 'Marked private', p.title); return prisma.portfolioEntry.update({ where: { id }, data: b }); });
  app.delete('/api/portfolio/:id', async (req, reply) => { const s = await requireStudent(req), { id } = req.params as { id: string };
    const p = await prisma.portfolioEntry.findFirst({ where: { id, studentId: s.id } }); if (!p) throw new HttpError(404, 'Not found');
    await prisma.portfolioEntry.delete({ where: { id } }); await audit(s.id, 'student', 'Deleted portfolio item', p.title); return reply.code(204).send(); });

  app.get('/api/audit', async req => { const s = await requireStudent(req); return prisma.auditEvent.findMany({ where: { studentId: s.id }, orderBy: { at: 'desc' }, take: 100 }); });
}
