import { createHash } from 'node:crypto';
import { prisma } from '../lib/db.js';
import { RunBudget } from '../discovery/config.js';
import { chunkText, keywordScore } from '../domain/knowledge.js';
import { initializeKnowledge, KnowledgeRuntime } from './runtime.js';
import { validVector, Passage, embeddingIdentity } from './contracts.js';
export async function ingestKnowledge(opportunityId: string, budget: RunBudget, runtime?: KnowledgeRuntime) {
  const rt = runtime || (await initializeKnowledge());
  if (!rt) return;
  const pages = await prisma.sourcePage.findMany({ where: { opportunityId } });
  const obsolete=await prisma.knowledgeChunk.findMany({where:{opportunityId,sourceUrl:{notIn:pages.map(p=>p.sourceUrl)}},select:{id:true}});
  if(obsolete.length){await prisma.knowledgeChunk.deleteMany({where:{id:{in:obsolete.map(c=>c.id)}}});await rt.store.delete(obsolete.map(c=>c.id));}
  for (const page of pages) {
    const old = await prisma.knowledgeChunk.findMany({ where: { opportunityId, sourceUrl: page.sourceUrl } });
    if (
      old.length &&
      old.every(
        (c) => c.contentHash === page.contentHash && c.embeddingModel === embeddingIdentity(rt.embedder),
      )
    ) {
      await prisma.knowledgeChunk.updateMany({
        where: { opportunityId, sourceUrl: page.sourceUrl },
        data: { checkedAt: page.checkedAt },
      });
      continue;
    }
    const texts = chunkText(page.text).slice(0, 20),
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
            `${opportunityId}|${page.sourceUrl}|${page.contentHash}|${embeddingIdentity(rt.embedder)}|${i}`,
          )
          .digest('hex'),
      opportunityId,
      text,
      sourceUrl: page.sourceUrl,
      pageTitle: page.pageTitle,
      checkedAt: page.checkedAt,
      contentHash: page.contentHash,
      embeddingModel: embeddingIdentity(rt.embedder),
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
export async function reconcileVectors(runtime?: KnowledgeRuntime) {
  const rt = runtime || (await initializeKnowledge());
  if (!rt) return 0;
  let cursor: string | undefined,
    removed = 0;
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
export async function searchKnowledge(
  opportunityId: string,
  query: string,
  runtime?: KnowledgeRuntime,
): Promise<Passage[]> {
  const rt = runtime || (await initializeKnowledge());
  if (!rt) return [];
  const [vector] = await rt.embedder.embed([query.slice(0, 1000)], 'query');
  if (!validVector(vector, rt.embedder.dimension)) return [];
  const matches = await rt.store.query(vector, opportunityId, 10);
  // Recheck ownership/scope in PostgreSQL even if vector metadata is wrong or stale.
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      id: { in: matches.map((m) => m.id) },
      opportunityId,
      scope: 'opportunity',
      embeddingModel: embeddingIdentity(rt.embedder),
    },
  });
  const snapshots=await prisma.sourcePage.findMany({where:{opportunityId},select:{sourceUrl:true,contentHash:true}});
  return chunks
    .filter(c=>snapshots.some(p=>p.sourceUrl===c.sourceUrl&&p.contentHash===c.contentHash))
    .map((c) => ({
      c,
      score: 0.6 * (matches.find((m) => m.id === c.id)?.score || 0) + 0.4 * keywordScore(c.text, query),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.c);
}
