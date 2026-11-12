import { BaseRetriever } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { prisma } from '../lib/db.js';
import { keywordScore } from '../domain/knowledge.js';
import { embeddingIdentity, vectorStoreIdentity, validVector, Passage } from './contracts.js';
import type { KnowledgeRuntime } from './runtime.js';

type SourceMetadata = { opportunityId: string; sourceUrl: string; pageTitle: string; checkedAt: string };
export class ProgramRetriever extends BaseRetriever<SourceMetadata> {
  lc_namespace = ['pathway', 'retrievers', 'official_program'];
  constructor(
    private readonly opportunityId: string | string[],
    private readonly runtime: KnowledgeRuntime,
  ) {
    super({ verbose: false });
  }
  async _getRelevantDocuments(query: string): Promise<Document<SourceMetadata>[]> {
    const rt = this.runtime;
    // Scope is bound by the server, never provided by the model's query.
    const ids=Array.isArray(this.opportunityId)?this.opportunityId:[this.opportunityId];
    if(!ids.length)return [];
    let matches:{id:string;score:number}[];
    if(rt.store.integratedEmbedding){
      if(!rt.store.queryText)throw new Error('Integrated text retrieval unavailable');
      matches=await rt.store.queryText(query.slice(0,1000),this.opportunityId,10);
    }else{
      const [vector]=await rt.embedder.embed([query.slice(0,1000)],'query');
      if(!vector||!validVector(vector,rt.embedder.dimension))return [];
      matches=await rt.store.query(vector,this.opportunityId,10);
    }
    const [chunks, snapshots] = await Promise.all([
      prisma.knowledgeChunk.findMany({
        where: {
          id: { in: matches.map((m) => m.id) },
          opportunityId: {in:ids},
          scope: 'opportunity',
          embeddingModel: embeddingIdentity(rt.embedder),
          vectorStoreKey: vectorStoreIdentity(rt.store),
        },
      }),
      prisma.sourcePage.findMany({
        where: { opportunityId: {in:ids} },
        select: { opportunityId:true, sourceUrl: true, contentHash: true },
      }),
    ]);
    return chunks
      .filter((c) => snapshots.some((p) => p.opportunityId===c.opportunityId && p.sourceUrl === c.sourceUrl && p.contentHash === c.contentHash))
      .map((c) => ({
        c,
        score: 0.6 * (matches.find((m) => m.id === c.id)?.score || 0) + 0.4 * keywordScore(c.text, query),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(
        ({ c }) =>
          new Document({
            id: c.id,
            pageContent: c.text,
            metadata: {
              opportunityId: c.opportunityId,
              sourceUrl: c.sourceUrl,
              pageTitle: c.pageTitle,
              checkedAt: c.checkedAt.toISOString(),
            },
          }),
      );
  }
}
export const passageFromDocument = (doc: Document<SourceMetadata>): Passage => ({
  id: doc.id!,
  opportunityId: doc.metadata.opportunityId,
  text: doc.pageContent,
  sourceUrl: doc.metadata.sourceUrl,
  pageTitle: doc.metadata.pageTitle,
  checkedAt: new Date(doc.metadata.checkedAt),
});
