import {withJobLock} from '../lib/job-lock.js';
import {j} from '../lib/db.js';
import {knowledgeScope} from './scope.js';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/db.js';
import { RunBudget } from '../discovery/config.js';
import { splitOfficialPages } from './documents.js';
import { ProgramRetriever, passageFromDocument } from './retriever.js';
import { privateWorkflow, workflowConfig } from '../workflows/privacy.js';
import { initializeKnowledge, KnowledgeRuntime } from './runtime.js';
import { validVector, Passage, embeddingIdentity, vectorStoreIdentity } from './contracts.js';
async function ingestUnlocked(opportunityId: string, budget: RunBudget, runtime?: KnowledgeRuntime) {
  const rt = runtime || (await initializeKnowledge());
  if (!rt) return;
  const pages = await prisma.sourcePage.findMany({ where: { opportunityId } });
  const obsolete = await prisma.knowledgeChunk.findMany({
    where: { opportunityId, sourceUrl: { notIn: pages.map((p) => p.sourceUrl) } },
    select: { id: true },
  });
  if (obsolete.length) {
    await prisma.knowledgeChunk.deleteMany({ where: { id: { in: obsolete.map((c) => c.id) } } });
    await rt.store.delete(obsolete.map((c) => c.id));
  }
  for (const page of pages) {
    const old = await prisma.knowledgeChunk.findMany({ where: { opportunityId, sourceUrl: page.sourceUrl } });
    if (
      old.length &&
      old.every(
        (c) => c.contentHash === page.contentHash && c.embeddingModel === embeddingIdentity(rt.embedder) && c.vectorStoreKey===vectorStoreIdentity(rt.store),
      )
    ) {
      await prisma.knowledgeChunk.updateMany({
        where: { opportunityId, sourceUrl: page.sourceUrl },
        data: { checkedAt: page.checkedAt },
      });
      continue;
    }
    const texts = (await splitOfficialPages([{ ...page, links: [] }]))
        .slice(0, 20)
        .map((doc) => doc.pageContent),
      vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += 20) {
      budget.take('embeddings');
      budget.usage.tokens += Math.ceil(texts.slice(i, i + 20).join(' ').length / 3);
      vectors.push(...(await rt.embedder.embed(texts.slice(i, i + 20), 'passage')));
    }
    if (vectors.length !== texts.length || vectors.some((v) => !validVector(v, rt.embedder.dimension)))
      throw new Error('Embedding dimensions or response do not match the index');
    const chunks = texts.map((text, i) => ({
      id:
        'chunk-' +
        createHash('sha256')
          .update(
            `${opportunityId}|${page.sourceUrl}|${page.contentHash}|${embeddingIdentity(rt.embedder)}|${vectorStoreIdentity(rt.store)}|${i}`,
          )
          .digest('hex'),
      opportunityId,
      text,
      sourceUrl: page.sourceUrl,
      pageTitle: page.pageTitle,
      checkedAt: page.checkedAt,
      contentHash: page.contentHash,
      embeddingModel: embeddingIdentity(rt.embedder),
      vectorStoreKey:vectorStoreIdentity(rt.store),
      localEmbedding: rt.store.kind === 'memory' ? JSON.stringify(vectors[i]) : '[]',
    }));
    budget.take('vectorUpserts', chunks.length);
    // Write the new vectors before retiring the old generation. PostgreSQL remains the authority.
    await rt.store.upsert(
      chunks.map((c, i) => ({
        id: c.id,
        values: vectors[i],
        metadata: {
          chunkId: c.id,
          opportunityId,
          sourceUrl: c.sourceUrl,
          pageTitle: c.pageTitle,
          checkedAt: c.checkedAt.toISOString(),
        },
      })),
    );
    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { opportunityId, sourceUrl: page.sourceUrl } });
      if (chunks.length) await tx.knowledgeChunk.createMany({ data: chunks });
    });
    await rt.store.delete(old.map((c) => c.id));
  }
}
export async function ingestKnowledge(opportunityId:string,budget:RunBudget,runtime?:KnowledgeRuntime) {
  return withJobLock('knowledge:'+opportunityId,()=>ingestUnlocked(opportunityId,budget,runtime));
}
export async function reconcileVectors(runtime?: KnowledgeRuntime) {
  const rt = runtime || (await initializeKnowledge());
  if (!rt) return 0;
  // Expired public text is retired only when no student still references it.
  const expired=await prisma.opportunity.findMany({where:{verificationStatus:'expired'},select:{id:true}});
  let retired=0;
  for(const o of expired) {
    const chunks=await prisma.$transaction(async tx=>{
      const [picks,saved,goals,proposals]=await Promise.all([tx.studentPick.count({where:{opportunityId:o.id}}),tx.savedOpportunity.count({where:{opportunityId:o.id,status:{not:'dismissed'}}}),tx.goal.count({where:{opportunityId:o.id}}),tx.agentAction.findMany({where:{status:'AWAITING_APPROVAL'},select:{actions:true}})]);
      if(picks||saved||goals||proposals.some(p=>j<{opportunityId?:string}[]>(p.actions,[]).some(a=>a.opportunityId===o.id)))return [];
      const chunks=await tx.knowledgeChunk.findMany({where:{opportunityId:o.id},select:{id:true}});
      await tx.knowledgeChunk.deleteMany({where:{opportunityId:o.id}});return chunks;
    });
    await rt.store.delete(chunks.map(c=>c.id));retired+=chunks.length;
  }
  let cursor: string | undefined,
    removed = retired;
  for (let page = 0; page < 100; page++) {
    const list = await rt.store.list(cursor);
    const known = await prisma.knowledgeChunk.findMany({
        where: { id: { in: list.ids } },
        select: { id: true },
      }),
      orphans = list.ids.filter((id) => !known.some((c) => c.id === id));
    await rt.store.delete(orphans);
    removed += orphans.length;
    cursor = list.cursor;
    if (!cursor) break;
  }
  return removed;
}
export async function searchKnowledge(studentId:string,query:string,scope:string,runtime?:KnowledgeRuntime):Promise<Passage[]> {
  const programs=await knowledgeScope(studentId,scope);
  if(!programs.length)return [];
  const rt=runtime||await initializeKnowledge();if(!rt)return [];
  return privateWorkflow(async()=>(await new ProgramRetriever(programs.map(p=>p.id),rt).invoke(query,workflowConfig('retrieve-official-program'))).map(passageFromDocument));
}
