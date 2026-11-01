-- Optional ONLY for VECTOR_STORE=pgvector. Default OpenAI embedding dimension: 1536.
-- Change BOTH vector(1536) and EMBEDDING_DIMENSION together before first use.
-- Run explicitly against your intended database; ordinary deployments need no extension.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS "KnowledgeVector" (
  id TEXT PRIMARY KEY,
  "opportunityId" TEXT NOT NULL,
  embedding vector(1536) NOT NULL
);
CREATE INDEX IF NOT EXISTS "KnowledgeVector_embedding_hnsw" ON "KnowledgeVector" USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "KnowledgeVector_opportunity" ON "KnowledgeVector" ("opportunityId");
