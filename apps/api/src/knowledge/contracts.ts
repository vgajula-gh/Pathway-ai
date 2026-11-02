export type VectorRecord = {
  id: string;
  values: number[];
  metadata: {
    chunkId: string;
    opportunityId: string;
    sourceUrl: string;
    pageTitle: string;
    checkedAt: string;
  };
};
export interface VectorStore {
  identity?: string;
  kind: 'memory' | 'pinecone' | 'pgvector';
  dimension(): Promise<number>;
  upsert(records: VectorRecord[]): Promise<void>;
  query(values: number[], opportunityId: string | string[], topK: number): Promise<{ id: string; score: number }[]>;
  delete(ids: string[]): Promise<void>;
  list(cursor?: string): Promise<{ ids: string[]; cursor?: string }>;
}
export interface Embedder {
  provider?: string;
  dimension: number;
  model: string;
  embed(texts: string[], type: 'query' | 'passage'): Promise<number[][]>;
}
export type Passage = {
  id: string;
  opportunityId: string;
  text: string;
  sourceUrl: string;
  pageTitle: string;
  checkedAt: Date;
};
export const cosine = (a: number[], b: number[]) =>
  a.length !== b.length
    ? 0
    : a.reduce((n, x, i) => n + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b) || 1);
export function validVector(v: number[], dimension: number) {
  return v.length === dimension && v.every(Number.isFinite) && v.some((x) => x !== 0);
}

export const embeddingIdentity = (e: Embedder) => `${e.provider ? e.provider+":" : ""}${e.model}:${e.dimension}`;

export const vectorStoreIdentity=(s:VectorStore)=>s.identity||s.kind;
