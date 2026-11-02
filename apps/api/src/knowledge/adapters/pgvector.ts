import { prisma } from '../../lib/db.js';
import { VectorStore } from '../contracts.js';
export function pgvectorStore(): VectorStore {
  return {
    kind: 'pgvector',
    async dimension() {
      const r = await prisma.$queryRawUnsafe<{ dim: number }[]>(
        "SELECT atttypmod AS dim FROM pg_attribute WHERE attrelid = '\"KnowledgeVector\"'::regclass AND attname = 'embedding'",
      );
      return r[0]?.dim || 0;
    },
    async upsert(records) {
      for (const r of records)
        await prisma.$executeRawUnsafe(
          'INSERT INTO "KnowledgeVector" (id, "opportunityId", embedding) VALUES ($1,$2,$3::vector) ON CONFLICT (id) DO UPDATE SET embedding=EXCLUDED.embedding, "opportunityId"=EXCLUDED."opportunityId"',
          r.id,
          r.metadata.opportunityId,
          JSON.stringify(r.values),
        );
    },
    async query(values, opportunityId, topK) {
      return prisma.$queryRawUnsafe<{ id: string; score: number }[]>(
        'SELECT id, 1 - (embedding <=> $1::vector) AS score FROM "KnowledgeVector" WHERE "opportunityId"=$2 ORDER BY embedding <=> $1::vector LIMIT $3',
        JSON.stringify(values),
        opportunityId,
        topK,
      );
    },
    async delete(ids) {
      for (const id of ids) await prisma.$executeRawUnsafe('DELETE FROM "KnowledgeVector" WHERE id=$1', id);
    },
    async list(cursor) {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        'SELECT id FROM "KnowledgeVector" WHERE id > $1 ORDER BY id LIMIT 100',
        cursor || '',
      );
      return { ids: rows.map((r) => r.id), cursor: rows.length === 100 ? rows.at(-1)!.id : undefined };
    },
  };
}
