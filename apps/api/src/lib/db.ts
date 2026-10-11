import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
export const j = <T>(s: string | null | undefined, fallback: T): T => { try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; } };
