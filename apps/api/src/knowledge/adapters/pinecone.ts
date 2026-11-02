import { pineconeClient } from './pinecone-client.js';
import { VectorStore } from '../contracts.js';
import { knowledgeIssue, KnowledgeSetupError } from '../readiness.js';
export function pineconeStore(): VectorStore {
  const pc = pineconeClient(),
    name = process.env.PINECONE_INDEX!,
    index = pc.index({ name, namespace: 'opportunities' });
  return {
    kind: 'pinecone',
    async dimension() {
      const d = await pc.describeIndex(name);
      if (d.metric !== 'cosine') throw new KnowledgeSetupError(
        knowledgeIssue('index_metric_mismatch', ['PINECONE_INDEX']), 'Pinecone index must use cosine similarity',
      );
      return d.dimension || 0;
    },
    async upsert(records) {
      await index.upsert({ records });
    },
    async query(vector, opportunityId, topK) {
      const r = await index.query({
        vector,
        topK,
        filter: { opportunityId: { $eq: opportunityId } },
        includeMetadata: false,
      });
      return r.matches.map((m) => ({ id: m.id, score: m.score || 0 }));
    },
    async delete(ids) {
      if (ids.length) await index.deleteMany({ ids });
    },
    async list(cursor) {
      const r = await index.listPaginated({ limit: 100, paginationToken: cursor });
      return { ids: r.vectors?.flatMap((v) => (v.id ? [v.id] : [])) || [], cursor: r.pagination?.next };
    },
  };
}
