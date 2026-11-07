import { pineconeClient } from './pinecone-client.js';
import { VectorStore } from '../contracts.js';
import { knowledgeIssue, KnowledgeSetupError } from '../readiness.js';
export function pineconeStore(): VectorStore {
  const pc = pineconeClient(),
    name = process.env.PINECONE_INDEX!,
    index = pc.index({ name, namespace: 'opportunities' });
  return {
    kind: 'pinecone',
    identity: `pinecone:${name}:opportunities`,
    async stats(){const stats=await index.describeIndexStats();return {namespace:'opportunities',recordCount:stats.namespaces?.opportunities?.recordCount||0};},
    async fetchIds(ids){if(!ids.length)return [];const result=await index.fetch({ids});return Object.keys(result.records);},
    async dimension() {
      const d = await pc.describeIndex(name);
      // SDK 9 exposes legacy dimension/metric as getters. Read the vector schema
      // directly so document/integrated-text indexes fail with a useful reason.
      const fields=d.schema?.fields;
      const primary=fields?fields._values:undefined;
      if(fields&&(!primary||!('type' in primary)||primary.type!=='dense_vector'||Object.entries(fields).some(([key,f])=>'type' in f&&['dense_vector','sparse_vector'].includes(f.type)&&!['_values','_sparse_values'].includes(key))))
        throw new KnowledgeSetupError(knowledgeIssue('index_api_mismatch',['PINECONE_INDEX','VECTOR_STORE']),'A classic dense vector index is required');
      const metric=primary&&'metric' in primary?primary.metric:d.metric;
      const dimension=primary&&'dimension' in primary?primary.dimension:d.dimension;
      if (metric !== 'cosine') throw new KnowledgeSetupError(
        knowledgeIssue('index_metric_mismatch', ['PINECONE_INDEX']), 'Pinecone index must use cosine similarity',
      );
      return dimension || 0;
    },
    async upsert(records) {
      await index.upsert({ records });
    },
    async query(vector, opportunityId, topK) {
      const r = await index.query({
        vector,
        topK,
        filter: { opportunityId: Array.isArray(opportunityId) ? { $in: opportunityId } : { $eq: opportunityId } },
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
