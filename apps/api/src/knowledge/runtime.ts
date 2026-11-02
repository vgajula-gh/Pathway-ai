import { Embedder, VectorStore, validVector, embeddingIdentity } from './contracts.js';
import { getEmbedder } from './embeddings/providers.js';
import { memoryStore } from './adapters/memory.js';
import { pineconeStore } from './adapters/pinecone.js';
import { pgvectorStore } from './adapters/pgvector.js';
import { prisma, j } from '../lib/db.js';
import { discoveryConfigured } from '../discovery/config.js';
export type KnowledgeRuntime = { store: VectorStore; embedder: Embedder };
export function assertDimension(index: number, embedding: number) {
  if (index !== embedding)
    throw new Error(
      `The vector index has ${index} dimensions, but the embedding model needs ${embedding}. Ask about this program is turned off until the settings match.`,
    );
}
let cached: Promise<KnowledgeRuntime | null> | undefined;
let retryAfter = 0;
export function pauseKnowledge() {
  cached = Promise.resolve(null);
  retryAfter = Date.now() + 60000;
}
export async function initializeKnowledge(): Promise<KnowledgeRuntime | null> {
  if (!discoveryConfigured()) return null;
  if (cached && (!retryAfter || Date.now() < retryAfter)) return cached;
  retryAfter = 0;
  cached = (async () => {
    try {
      const embedder = getEmbedder();
      if (!embedder) return null;
      const kind = process.env.DATABASE_URL?.startsWith('file:')
        ? 'memory'
        : process.env.VECTOR_STORE || (process.env.NODE_ENV === 'production' ? 'pinecone' : 'memory');
      if (kind === 'pinecone' && (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX)) return null;
      const store =
        kind === 'pinecone'
          ? pineconeStore()
          : kind === 'pgvector'
            ? pgvectorStore()
            : kind === 'memory'
              ? memoryStore(embedder.dimension)
              : null;
      if (!store) return null;
      assertDimension(await store.dimension(), embedder.dimension);
      if (store.kind === 'memory') {
        const chunks = await prisma.knowledgeChunk.findMany({
          where: { embeddingModel: embeddingIdentity(embedder) },
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
      return { embedder, store };
    } catch (error) {
      console.warn(
        'Program questions are unavailable. Check embedding model, vector index dimensions and provider credentials.',
        error instanceof Error && error.message.includes('dimensions') ? error.message : '',
      );
      retryAfter = Date.now() + 60000;
      return null;
    }
  })();
  return cached;
}
