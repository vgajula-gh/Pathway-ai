import { FastifyInstance } from 'fastify';
import { requireStudent, HttpError } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { applicationsFor } from '../lib/applications.js';
import { ApplicationPatch, prepActions } from '../domain/applications.js';
import { dkey, wallNow } from '../domain/time.js';
import { loadContext } from '../lib/context.js';
import { createProposal, serializeProposal } from '../lib/proposals.js';
import { audit } from '../lib/audit.js';

export default async function routes(app: FastifyInstance) {
  app.get('/api/applications', async req => { const s = await requireStudent(req); return applicationsFor(s.id, dkey(wallNow(s.timezone))); });
  app.patch('/api/applications/:id', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string }, b = ApplicationPatch.parse(req.body);
    const where = { studentId_opportunityId: { studentId: s.id, opportunityId: id } };
    if (!await prisma.savedOpportunity.findUnique({ where })) throw new HttpError(404, 'Application not found');
    await prisma.savedOpportunity.update({ where, data: { ...b, checklist: b.checklist && JSON.stringify(b.checklist) } });
    await audit(s.id, 'student', 'Updated application tracker', JSON.stringify({opportunityId:id,status:b.status,occurredOn:dkey(wallNow(s.timezone))}));
    return { ok: true };
  });
  app.post('/api/applications/:id/prep', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string }, now = wallNow(s.timezone);
    const application = (await applicationsFor(s.id, dkey(now))).find(a => a.opportunityId === id);
    if (!application?.deadline) throw new HttpError(422, 'Add a deadline or confirm it on the official site before planning prep.');
    const { events, rules } = await loadContext(s.id);
    const actions = prepActions(application.name, application.deadline, events, rules, now);
    if (!actions.length) throw new HttpError(422, 'There is no free prep time before this deadline. You can review your calendar or update the date.');
    return serializeProposal(await createProposal(s.id, { summary: `Prep for ${application.name}`.slice(0, 200), rationale: `Free-time prep before ${application.deadline}. Deadline: ${application.deadlineSource}. Review these blocks before approving.`, actions }, 'student'));
  });
}
