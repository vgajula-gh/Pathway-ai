import { VectorStore, VectorRecord, cosine } from '../contracts.js';
export function memoryStore(dimension: number): VectorStore {
  const records = new Map<string, VectorRecord>();
  return {
    kind: 'memory',
    async dimension() {
      return dimension;
    },
    async upsert(items) {
      for (const item of items) records.set(item.id, item);
    },
    async delete(ids) {
      ids.forEach((id) => records.delete(id));
    },
    async query(values, opportunityId, topK) {
      return [...records.values()]
        .filter((v) => (Array.isArray(opportunityId)?opportunityId:[opportunityId]).includes(v.metadata.opportunityId))
        .map((v) => ({ id: v.id, score: cosine(values, v.values) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
    async list() {
      return { ids: [...records.keys()] };
    },
  };
}
