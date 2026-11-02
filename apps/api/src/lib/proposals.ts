// Proposal service: create → approve (revalidate, execute atomically, verify) → audit.
// External actions (emails, registrations, phone calendars) are NOT executed by the server;
// they require separate, explicit user actions on the client. Never report success early.
import { applyRequirements, validateRequirements } from '../knowledge/requirements.js';
import { saveApplication } from './applications.js';
import { prisma, j } from './db.js';
import { audit } from './audit.js';
import { loadContext } from './context.js';
import { Action, idemKey, PROPOSAL_TTL_MS, ProposalInput } from '../domain/actions.js';
import { checkSessions } from '../domain/schedule.js';
import { HttpError } from './auth.js';

type Log = { s: string; t: number }[];

async function calendarProblems(studentId: string, actions: Action[]) {
  const { events, rules } = await loadContext(studentId);
  const moving = new Set(actions.filter(a => a.type === 'move_event' || a.type === 'remove_event').map(a => (a as { eventId: string }).eventId));
  for (const a of actions) if ((a.type === 'move_event' || a.type === 'remove_event') && !events.some(e => e.id === a.eventId)) return [`Event ${a.eventId} no longer exists`];
  for (const a of actions) if ((a.type === 'move_event' || a.type === 'remove_event') && events.find(e => e.id === a.eventId)?.readOnly) return ['Imported calendar events are read-only. Change them in the source calendar.'];
  for (const a of actions) if (a.type === 'move_event' && events.find(e => e.id === a.eventId)?.recurDays.length) return ['Recurring events can\u2019t be moved by a proposal'];
  const sessions = actions.flatMap(a => a.type === 'add_event' ? [{ title: a.title, type: a.eventType, start: a.start, end: a.end }]
    : a.type === 'move_event' ? [{ title: events.find(e => e.id === a.eventId)!.title, type: events.find(e => e.id === a.eventId)!.type, start: a.start, end: a.end }] : []);
  const r = checkSessions(events.filter(e => !moving.has(e.id)), rules, sessions);
  return r.problems.map(p => `"${p.session.title}" ${p.issue}`);
}

export async function createProposal(studentId: string, raw: unknown, origin: 'agent' | 'student', extra: { dataUsed?: string[]; effect?: string } = {}) {
  const input = ProposalInput.parse(raw);
  const goalRefs = new Set(input.actions.filter(a => a.type === 'add_goal').map(a => (a as { ref: string }).ref));
  const goals = await prisma.goal.findMany({ where: { studentId }, select: { id: true } });
  for (const a of input.actions) if (a.type === 'add_milestone' && !goalRefs.has(a.goalRef) && !goals.some(g => g.id === a.goalRef)) throw new HttpError(422, `Milestone "${a.title}" refers to an unknown goal`);
  for(const a of input.actions) if(a.type==='add_application_requirements') await validateRequirements(prisma,studentId,a);
  const problems = await calendarProblems(studentId, input.actions);
  if (problems.length) throw new HttpError(422, 'Calendar problems: ' + problems.join(' | '));
  const key = idemKey(studentId, input.actions);
  const dup = await prisma.agentAction.findFirst({ where: { studentId, idemKey: key, status: 'AWAITING_APPROVAL' } });
  if (dup) return dup;
  const now = Date.now();
  const p = await prisma.agentAction.create({ data: {
    studentId, origin, summary: input.summary, rationale: input.rationale, actions: JSON.stringify(input.actions), idemKey: key, status: 'AWAITING_APPROVAL',
    dataUsed: JSON.stringify(extra.dataUsed || ['Your calendar and free time', 'Your goals and interests']),
    effect: extra.effect || 'Changes stay inside Pathway. Nothing is sent, submitted or shared outside the app.',
    log: JSON.stringify([{ s: 'PROPOSED', t: now }, { s: 'AWAITING_APPROVAL', t: now }]), expiresAt: new Date(now + PROPOSAL_TTL_MS) } });
  await audit(studentId, origin === 'agent' ? 'pathway' : 'student', 'Proposed', input.summary);
  return p;
}

export async function rejectProposal(studentId: string, id: string) {
  const p = await prisma.agentAction.findFirst({ where: { id, studentId } });
  if (!p) throw new HttpError(404, 'Not found');
  if (p.status !== 'AWAITING_APPROVAL') throw new HttpError(409, `Proposal is ${p.status}`);
  const log: Log = [...j<Log>(p.log, []), { s: 'REJECTED', t: Date.now() }];
  await audit(studentId, 'student', 'Declined', p.summary);
  return prisma.agentAction.update({ where: { id }, data: { status: 'REJECTED', log: JSON.stringify(log) } });
}

export async function expireProposals(studentId: string) {
  const stale = await prisma.agentAction.findMany({ where: { studentId, status: 'AWAITING_APPROVAL', expiresAt: { lt: new Date() } } });
  for (const p of stale) await prisma.agentAction.update({ where: { id: p.id }, data: { status: 'EXPIRED', log: JSON.stringify([...j<Log>(p.log, []), { s: 'EXPIRED', t: Date.now() }]) } });
}

export async function approveProposal(studentId: string, id: string) {
  await expireProposals(studentId);
  const p = await prisma.agentAction.findFirst({ where: { id, studentId } });
  if (!p) throw new HttpError(404, 'Not found');
  if (p.status !== 'AWAITING_APPROVAL') throw new HttpError(409, `Proposal is ${p.status}`);
  const log: Log = j<Log>(p.log, []);
  const step = async (s: string, data: Record<string, unknown> = {}) => { log.push({ s, t: Date.now() }); await prisma.agentAction.update({ where: { id }, data: { status: s, log: JSON.stringify(log), ...data } }); };
  await step('APPROVED'); await audit(studentId, 'student', 'Approved', p.summary);
  if (await prisma.agentAction.findFirst({ where: { studentId, idemKey: p.idemKey, status: 'VERIFIED' } })) { await step('FAILED', { result: 'Already applied once. Duplicate blocked.' }); return prisma.agentAction.findUniqueOrThrow({ where: { id } }); }
  await step('EXECUTING');
  const actions = j<Action[]>(p.actions, []);
  const problems = await calendarProblems(studentId, actions);
  if (problems.length) { await step('FAILED', { result: 'Your schedule changed since this was suggested: ' + problems.join('; ') + '. Nothing was applied.' }); await audit(studentId, 'system', 'Failed', p.summary); return prisma.agentAction.findUniqueOrThrow({ where: { id } }); }
  try {
    const created: [string, string][] = await prisma.$transaction(async tx => {
      const refs: Record<string, string> = {}, out: [string, string][] = [];
      for (const a of actions) {
        if (a.type === 'add_event') { const e = await tx.event.create({ data: { studentId, title: a.title, type: a.eventType, start: a.start, end: a.end, location: a.location, source: 'pathway', proposalId: id } }); out.push(['event', e.id]); }
        if (a.type === 'move_event') { await tx.event.update({ where: { id: a.eventId }, data: { start: a.start, end: a.end } }); out.push(['event', a.eventId]); }
        if (a.type === 'remove_event') { await tx.event.delete({ where: { id: a.eventId } }); out.push(['removed', a.eventId]); }
        if (a.type === 'add_goal') { const g = await tx.goal.create({ data: { studentId, title: a.title, category: a.category, priority: a.priority, targetDate: a.targetDate, opportunityId: a.opportunityId } }); refs[a.ref] = g.id; out.push(['goal', g.id]); }
        if (a.type === 'add_milestone') { const m = await tx.milestone.create({ data: { goalId: refs[a.goalRef] || a.goalRef, title: a.title, purpose: a.purpose, effortMin: a.effortMin, targetDate: a.targetDate } }); out.push(['milestone', m.id]); }
        if (a.type === 'add_application_requirements') { await applyRequirements(tx,studentId,a); out.push(['saved',a.opportunityId]); }
        if (a.type === 'save_opportunity') { await saveApplication(tx, studentId, a.opportunityId); out.push(['saved', a.opportunityId]); }
        if (a.type === 'add_portfolio_entry') { const x = await tx.portfolioEntry.create({ data: { studentId, title: a.title, type: a.entryType, date: a.date || new Date().toISOString().slice(0, 10), reflection: a.reflection, skills: JSON.stringify(a.skills) } }); out.push(['portfolio', x.id]); }
      }
      // Verify inside the transaction: every intended change must be observable.
      for (const [k, rid] of out) {
        const okay = k === 'event' ? await tx.event.findUnique({ where: { id: rid } }) : k === 'removed' ? !(await tx.event.findUnique({ where: { id: rid } })) : k === 'goal' ? await tx.goal.findUnique({ where: { id: rid } })
          : k === 'milestone' ? await tx.milestone.findUnique({ where: { id: rid } }) : k === 'saved' ? await tx.savedOpportunity.findUnique({ where: { studentId_opportunityId: { studentId, opportunityId: rid } } }) : await tx.portfolioEntry.findUnique({ where: { id: rid } });
        if (!okay) throw new Error(`Verification failed for ${k}`);
      }
      return out;
    });
    await step('VERIFIED', { result: `Saved and verified ${created.length} change${created.length === 1 ? '' : 's'}.`, createdIds: JSON.stringify(created) });
    await audit(studentId, 'pathway', 'Verified', p.summary);
  } catch (err) {
    await step('FAILED', { result: `${(err as Error).message}. All changes were rolled back.` });
    await audit(studentId, 'system', 'Failed', p.summary);
  }
  return prisma.agentAction.findUniqueOrThrow({ where: { id } });
}

export const serializeProposal = (p: { id: string; summary: string; rationale: string; actions: string; dataUsed: string; effect: string; status: string; result: string; log: string; expiresAt: Date; createdAt: Date; origin: string; createdIds: string }) => ({
  id: p.id, summary: p.summary, rationale: p.rationale, actions: j(p.actions, []), dataUsed: j(p.dataUsed, []), effect: p.effect, status: p.status, result: p.result,
  log: j(p.log, []), createdIds: j(p.createdIds, []), expiresAt: p.expiresAt, createdAt: p.createdAt, origin: p.origin
});
