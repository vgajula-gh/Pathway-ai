import { applicationsFor } from '../lib/applications.js';
import { dueSoon } from '../domain/applications.js';
import { wallNow } from '../domain/time.js';
import { reserveAI } from '../lib/ai-limits.js';
import { FastifyInstance } from 'fastify';
import { prisma, j } from '../lib/db.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { loadContext } from '../lib/context.js';
import { addDays, dkey, fmtLocal, sod } from '../domain/time.js';
import { expand, findConflicts } from '../domain/schedule.js';
import { headline, nudges, todayMetrics } from '../domain/metrics.js';
import { askJSON, getLLM } from '../agent/llm/index.js';
import { BRIEF_PROMPT, BRIEF_SYSTEM } from '../agent/prompts.js';
import { WORDS } from '../data/words.js';

export default async function routes(app: FastifyInstance) {
  app.get('/api/today', async req => {
    const s = await requireStudent(req), { events, rules, milestones, goals } = await loadContext(s.id), now = wallNow(s.timezone), today = dkey(now);
    const occ = expand(events, sod(now), addDays(sod(now), 1));
    const clash = new Set(findConflicts(occ).filter(c => c.kind === 'overlap').flatMap(c => [c.a.id, c.b.id]));
    const brief = await prisma.dailyBrief.findUnique({ where: { studentId_date: { studentId: s.id, date: today } } });
    const pending = await prisma.agentAction.findMany({ where: { studentId: s.id, status: 'AWAITING_APPROVAL' }, orderBy: { createdAt: 'desc' } });
    const n = nudges(events, rules, milestones, now);
    const saved = await prisma.savedOpportunity.findMany({ where: { studentId: s.id, status: { in: ['saved', 'interested', 'preparing'] } } });
    const unplanned = saved.find(x => !goals.some(g => g.opportunityId === x.opportunityId));
    const nextAction = n[0] ? { title: n[0].title, why: n[0].body, ask: n[0].ask, source: 'Spotted automatically in your calendar', dataUsed: ['Your calendar for the next 7 days'] }
      : unplanned ? { title: 'Take the first step on a saved opportunity', why: 'You saved it but haven\u2019t planned it yet.', opportunityId: unplanned.opportunityId, source: 'Based on your saved opportunities', dataUsed: ['Saved opportunities'] }
      : { title: 'Find one opportunity that fits you', why: 'Picked around your interests.', route: '/explore', source: 'Based on your interests', dataUsed: ['Your interests and grade'] };
    const word = WORDS[Math.floor((+sod(now) - +new Date(now.getFullYear(), 0, 0)) / 864e5) % WORDS.length];
    return { dueSoon: dueSoon(await applicationsFor(s.id, today), today), date: today, headline: headline(events, rules, now), metrics: todayMetrics(events, rules, milestones, now), brief: brief ? j(brief.data, null) : null, nextAction, nudges: n,
      timeline: occ.map(o => ({ id: o.id, title: o.title, type: o.type, start: fmtLocal(o.s), end: fmtLocal(o.e), source: o.source, done: o.done, recurring: o.recurDays.length > 0, clash: clash.has(o.id) })),
      comingUp: expand(events, addDays(sod(now), 1), addDays(sod(now), 8)).filter(o => ['exam', 'deadline', 'competition', 'reminder'].includes(o.type)).slice(0, 4).map(o => ({ id: o.id, title: o.title, type: o.type, start: fmtLocal(o.s) })),
      pending: pending.map(p => ({ id: p.id, summary: p.summary, count: j<unknown[]>(p.actions, []).length })), word: { word: word[0], pos: word[1], meaning: word[2], example: word[3] } };
  });

  app.post('/api/today/insight', async req => {
    const s = await requireStudent(req); if (!s.aiConsent) throw new HttpError(403, 'AI help is turned off');
    if (getLLM()) await reserveAI(s.id);
    const { events, rules, milestones, goals } = await loadContext(s.id), now = new Date();
    const data = JSON.stringify({ name: s.name, today: now.toDateString(), events: expand(events, sod(now), addDays(sod(now), 1)).map(o => `${fmtLocal(o.s)} ${o.title} [${o.type}]`),
      upcoming: expand(events, addDays(sod(now), 1), addDays(sod(now), 8)).filter(o => ['exam', 'deadline', 'competition'].includes(o.type)).map(o => `${o.s.toDateString()} ${o.title}`),
      metrics: todayMetrics(events, rules, milestones, now), goals: goals.map(g => g.title) });
    const brief = await askJSON(BRIEF_SYSTEM, BRIEF_PROMPT(data));
    await prisma.dailyBrief.upsert({ where: { studentId_date: { studentId: s.id, date: dkey(now) } }, update: { data: JSON.stringify(brief) }, create: { studentId: s.id, date: dkey(now), data: JSON.stringify(brief) } });
    return brief;
  });
}
