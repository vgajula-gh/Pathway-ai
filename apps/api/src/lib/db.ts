import { PrismaClient } from '@prisma/client';
// SQLite permits one writer; avoid lock contention between interactive quota
// transactions in local development. PostgreSQL keeps its normal connection pool.
const url = process.env.DATABASE_URL;
const datasourceUrl = url?.startsWith('file:') ? `${url}${url.includes('?') ? '&' : '?'}connection_limit=1` : url;
export const prisma = new PrismaClient({ datasourceUrl });
export const j = <T>(s: string | null | undefined, fallback: T): T => { try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; } };
