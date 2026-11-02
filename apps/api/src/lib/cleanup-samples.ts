import { Prisma } from '@prisma/client';
import { prisma, j } from './db.js';
import type { VectorStore } from '../knowledge/contracts.js';
import { pineconeStore } from '../knowledge/adapters/pinecone.js';
import { pgvectorStore } from '../knowledge/adapters/pgvector.js';

async function maintenanceStore(): Promise<Pick<VectorStore, 'delete'>> {
  const kind = process.env.DATABASE_URL?.startsWith('file:') ? 'memory'
    : process.env.VECTOR_STORE || (process.env.NODE_ENV === 'production' ? 'pinecone' : 'memory');
  if (kind === 'memory') return { delete: async () => {} };
  if (kind === 'pgvector') return pgvectorStore();
  if (kind === 'pinecone' && process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX) return pineconeStore();
  throw new Error('Vector cleanup is not configured');
}

/** Explicit maintenance only. Never removes accounts, events, plans, notes or feedback. */
export async function cleanupSamples(options: { apply?: boolean; store?: Pick<VectorStore, 'delete'> } = {}) {
  const candidates = await prisma.opportunity.findMany({ where: { OR: [{ source: 'seed' }, { isSample: true }] }, select: { id: true } });
  const result = { candidates: candidates.length, eligible: 0, protected: 0, removed: 0, failed: 0, dryRun: !options.apply };
  let store = options.store;
  for (const candidate of candidates) {
    try {
      const outcome = await prisma.$transaction(async tx => {
        const opportunity = await tx.opportunity.findUnique({ where: { id: candidate.id } });
        if (!opportunity || (!opportunity.isSample && opportunity.source !== 'seed')) return 'gone';
        const [saved, feedback, goals, proposals] = await Promise.all([
          tx.savedOpportunity.count({ where: { opportunityId: candidate.id } }),
          tx.opportunityFeedback.count({ where: { opportunityId: candidate.id } }),
          tx.goal.count({ where: { opportunityId: candidate.id } }),
          tx.agentAction.findMany({ where: { status: { in: ['AWAITING_APPROVAL', 'APPROVED', 'EXECUTING'] } }, select: { actions: true } }),
        ]);
        const proposed = proposals.some(p => j<{ opportunityId?: string }[]>(p.actions, []).some(a => a.opportunityId === candidate.id));
        if (saved || feedback || goals || proposed) return 'protected';
        if (!options.apply) return 'eligible';
        const chunks = await tx.knowledgeChunk.findMany({ where: { opportunityId: candidate.id }, select: { id: true } });
        if (chunks.length) {
          store ||= await maintenanceStore();
          for (let i = 0; i < chunks.length; i += 1000) await store.delete(chunks.slice(i, i + 1000).map(c => c.id));
        }
        // These are derived sample recommendations; no student-authored record is removed.
        await tx.studentPick.deleteMany({ where: { opportunityId: candidate.id } });
        await tx.opportunity.delete({ where: { id: candidate.id } });
        return 'removed';
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
      if (outcome === 'protected') result.protected++;
      if (outcome === 'eligible' || outcome === 'removed') result.eligible++;
      if (outcome === 'removed') result.removed++;
    } catch { result.failed++; }
  }
  return result;
}
