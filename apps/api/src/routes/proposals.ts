import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { approveProposal, expireProposals, rejectProposal, serializeProposal } from '../lib/proposals.js';

export default async function routes(app: FastifyInstance) {
  app.get('/api/proposals', async req => {
    const s = await requireStudent(req); await expireProposals(s.id);
    const { status } = req.query as { status?: string };
    return (await prisma.agentAction.findMany({ where: { studentId: s.id, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 })).map(serializeProposal);
  });
  app.get('/api/proposals/:id', async req => {
    const s = await requireStudent(req), { id } = req.params as { id: string };
    const p = await prisma.agentAction.findFirst({ where: { id, studentId: s.id } }); if (!p) throw new HttpError(404, 'Not found'); return serializeProposal(p);
  });
  app.post('/api/proposals/:id/approve', async req => { const s = await requireStudent(req); return serializeProposal(await approveProposal(s.id, (req.params as { id: string }).id)); });
  app.post('/api/proposals/:id/reject', async req => { const s = await requireStudent(req); return serializeProposal(await rejectProposal(s.id, (req.params as { id: string }).id)); });
}
