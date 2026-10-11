import { FastifyInstance } from 'fastify';
import { prisma, j } from '../lib/db.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { loadContext } from '../lib/context.js';
import { createProposal, serializeProposal } from '../lib/proposals.js';
import { addDays, dkey, fmtLocal, parseLocal, sod } from '../domain/time.js';
import { dayCapacity, freeSlots } from '../domain/schedule.js';
import { scoreOpportunity } from '../domain/scoring.js';

const toOpp = (o: any) => ({ ...o, skills: j(o.skills, []), tags: j(o.tags, []), checks: j(o.checks, []) });

async function scored(studentId: string) {
  const { events, rules, ctx } = await loadContext(studentId);
  let weekFree = 0; for (let d = 0; d < 7; d++) weekFree += dayCapacity(events, rules, addDays(sod(new Date()), d)).available;
  const [opps, saved] = await Promise.all([prisma.opportunity.findMany(), prisma.savedOpportunity.findMany({ where: { studentId } })]);
  return opps.map(toOpp).map(o => ({ ...o, verified: !!o.sourceCheckedAt, status: saved.find(s => s.opportunityId === o.id)?.status || null, fit: scoreOpportunity(o, ctx, weekFree) }));
}

export default async function routes(app: FastifyInstance) {
  app.get('/api/opportunities', async req => {
    const s = await requireStudent(req), list = await scored(s.id);
    const ok = list.filter(o => !o.fit.excluded && o.status !== 'dismissed').sort((a, b) => ((b.fit as any).score - (a.fit as any).score));
    return { recommended: ok, excluded: list.filter(o => o.fit.excluded).map(o => ({ id: o.id, name: o.name, reasons: o.fit.eligibility.reasons })), dismissed: list.filter(o => o.status === 'dismissed').length, sampleData: list.some(o => o.isSample) };
  });

  app.get('/api/opportunities/:id', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string };
    const o = (await scored(s.id)).find(x => x.id === id); if (!o) throw new HttpError(404, 'Not found'); return o;
  });

  app.post('/api/opportunities/:id/status', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string }, { status } = req.body as { status: 'saved' | 'dismissed' | 'none' };
    if (status === 'none') await prisma.savedOpportunity.deleteMany({ where: { studentId: s.id, opportunityId: id } });
    else await prisma.savedOpportunity.upsert({ where: { studentId_opportunityId: { studentId: s.id, opportunityId: id } }, update: { status }, create: { studentId: s.id, opportunityId: id, status } });
    await audit(s.id, 'student', status === 'saved' ? 'Saved opportunity' : status === 'dismissed' ? 'Dismissed opportunity' : 'Cleared opportunity', id);
    return { ok: true };
  });

  // Journey A: deterministic prep plan (no AI needed) → proposal awaiting approval.
  app.post('/api/opportunities/:id/prep', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string };
    const o = await prisma.opportunity.findUnique({ where: { id } }); if (!o) throw new HttpError(404, 'Not found');
    const { events, rules, goals } = await loadContext(s.id), now = new Date();
    const slot = freeSlots(events, rules, dkey(addDays(now, 1)), dkey(addDays(now, 4)), 15, 1, now)[0];
    const start = slot?.start || `${dkey(addDays(now, 1))}T${rules.studyStart}`, end = fmtLocal(new Date(+parseLocal(start)! + 15 * 6e4));
    const saved = await prisma.savedOpportunity.findUnique({ where: { studentId_opportunityId: { studentId: s.id, opportunityId: id } } });
    const actions: any[] = [];
    if (saved?.status !== 'saved') actions.push({ type: 'save_opportunity', opportunityId: id });
    actions.push({ type: 'add_event', title: `Prep for ${o.name}`, eventType: 'reminder', start, end });
    if (!goals.some(g => g.opportunityId === id && g.status !== 'done')) actions.push(
      { type: 'add_goal', ref: 'g1', title: `Get ready for ${o.name}`, category: 'opportunity', priority: 'medium', opportunityId: id },
      { type: 'add_milestone', goalRef: 'g1', title: 'Confirm eligibility and deadline on the official site', effortMin: 15, targetDate: dkey(addDays(now, 3)) },
      { type: 'add_milestone', goalRef: 'g1', title: 'First prep session', effortMin: 45, targetDate: dkey(addDays(now, 7)) });
    const p = await createProposal(s.id, { summary: `Get ready for ${o.name}`, rationale: `A short reminder ${slot ? 'in your free time' : 'tomorrow'} to confirm the details, plus a simple goal to track your prep.`, actions }, 'student',
      { dataUsed: ['Your free time this week', 'Your grade and interests', `This opportunity record (${o.sourceCheckedAt ? 'verified' : 'not verified'})`], effect: 'Adds a reminder to your Pathway timeline and a goal with steps. Nothing is sent, submitted or registered anywhere.' });
    return serializeProposal(p);
  });
}
