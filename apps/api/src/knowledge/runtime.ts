import { Embedder, VectorStore, validVector, embeddingIdentity,vectorStoreIdentity } from './contracts.js';
import { getEmbedder } from './embeddings/providers.js';
import { memoryStore } from './adapters/memory.js';
import { pineconeStore } from './adapters/pinecone.js';
import { pgvectorStore } from './adapters/pgvector.js';
import { prisma, j } from '../lib/db.js';
import { env } from '../lib/env.js';
import { knowledgeConfigurationIssue, connectionIssue, knowledgeIssue, KnowledgeIssue, KnowledgeSetupError } from './readiness.js';
import {knowledgeFailure} from './failures.js';
import type {FailureInfo} from '../discovery/failures.js';
export type KnowledgeRuntime = { store: VectorStore; embedder: Embedder };
export function assertDimension(index: number, embedding: number) {
  if (index !== embedding)
    throw new KnowledgeSetupError(
      knowledgeIssue('index_dimension_mismatch', ['EMBEDDING_MODEL', 'EMBEDDING_DIMENSION', 'PINECONE_INDEX', 'VECTOR_STORE']),
      `The vector index has ${index} dimensions, but the embedding model needs ${embedding}. Ask about this program is turned off until the settings match.`,
      {expectedDimension:embedding,actualDimension:index},
    );
}
let cached: Promise<KnowledgeRuntime | null> | undefined;
let retryAfter = 0;
let unavailable: KnowledgeIssue | null = null;
let connectionFailure:FailureInfo|null=null;
export const knowledgeConnectionFailure=()=>connectionFailure;
export function knowledgeUnavailable(): KnowledgeIssue {
  return unavailable || knowledgeConfigurationIssue(process.env, env.aiDisabled) || knowledgeIssue('vector_unavailable');
}
export function pauseKnowledge() {
  connectionFailure=null;
  unavailable = knowledgeIssue('vector_unavailable');
  cached = Promise.resolve(null);
  retryAfter = Date.now() + 60000;
}
export async function initializeKnowledge(): Promise<KnowledgeRuntime | null> {
  if (env.aiDisabled || process.env.AI_DISABLED==='true') {
    connectionFailure=null;
    unavailable = knowledgeConfigurationIssue(process.env, env.aiDisabled);
    return null;
  }
  if (cached && (!retryAfter || Date.now() < retryAfter)) return cached;
  retryAfter = 0;
  const kind = process.env.DATABASE_URL?.startsWith('file:')
    ? 'memory'
    : process.env.VECTOR_STORE || 'memory';
  cached = (async () => {
    try {
      unavailable = knowledgeConfigurationIssue(process.env, env.aiDisabled);
      connectionFailure=null;
      if (unavailable) {
        retryAfter = Date.now() + 60000;
        return null;
      }
      const embedder = getEmbedder();
      if (!embedder) throw new KnowledgeSetupError(knowledgeIssue('embedding_not_configured', ['EMBEDDING_PROVIDER']), 'Embedding provider unavailable');
      const store =
        kind === 'pinecone'
          ? pineconeStore()
          : kind === 'pgvector'
            ? pgvectorStore()
            : kind === 'memory'
              ? memoryStore(embedder.dimension)
              : null;
      if (!store) throw new KnowledgeSetupError(knowledgeIssue('vector_not_configured', ['VECTOR_STORE']), 'Vector store unavailable');
      assertDimension(await store.dimension(), embedder.dimension);
      if (store.kind === 'memory') {
        const chunks = await prisma.knowledgeChunk.findMany({
          where: { embeddingModel: embeddingIdentity(embedder),vectorStoreKey:vectorStoreIdentity(store) },
        });
        await store.upsert(
          chunks.flatMap((c) => {
            const values = j<number[]>(c.localEmbedding, []);
            return validVector(values, embedder.dimension)
              ? [
                  {
                    id: c.id,
                    values,
                    metadata: {
                      chunkId: c.id,
                      opportunityId: c.opportunityId,
                      sourceUrl: c.sourceUrl,
                      pageTitle: c.pageTitle,
                      checkedAt: c.checkedAt.toISOString(),
                    },
                  },
                ]
              : [];
          }),
        );
      }
      unavailable = null;
      return { embedder, store };
    } catch (error) {
      connectionFailure=knowledgeFailure(error,'vector','store_info').info;
      unavailable = connectionIssue(error, kind);
      console.warn(
        'Program questions are unavailable.', unavailable.code, unavailable.settings.join(', '),
      );
      retryAfter = Date.now() + 60000;
      return null;
    }
  })();
  return cached;
}
