import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Real isolated SQLite database exercises conditional updates and rollback.
const dir = mkdtempSync(join(tmpdir(), 'pathway-limits-'));
vi.hoisted(() => { process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db'; });
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasourceUrl: `file:${dir}/limits.db?connection_limit=1` });
vi.mock('../src/lib/db.js', () => ({ get prisma() { return db; } }));
import { reserveAI, limit } from '../src/lib/ai-limits.js';

beforeAll(async () => {
  await db.$executeRawUnsafe('CREATE TABLE "AIUsage" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 0)');
});
beforeEach(async () => { await db.aIUsage.deleteMany(); vi.stubEnv('AI_DAILY_LIMIT', '2'); vi.stubEnv('AI_MONTHLY_LIMIT', '3'); });
afterAll(async () => { vi.unstubAllEnvs(); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
const day = new Date('2026-11-01T12:00:00Z');
describe('persistent AI budgets', () => {
  it('enforces per-student limits without charging rejected requests to the monthly budget', async () => {
    await reserveAI('one', day); await reserveAI('one', day);
    await expect(reserveAI('one', day)).rejects.toMatchObject({ status: 429, message: expect.stringContaining('tomorrow') });
    await reserveAI('two', day);
    await expect(reserveAI('three', day)).rejects.toMatchObject({ status: 429, message: expect.stringContaining('next month') });
    expect((await db.aIUsage.findUnique({ where: { key: 'month:2026-11' } }))?.count).toBe(3);
  });
  it('resets daily and monthly windows at UTC boundaries', async () => {
    vi.stubEnv('AI_DAILY_LIMIT', '1'); vi.stubEnv('AI_MONTHLY_LIMIT', '2');
    await reserveAI('one', day);
    await reserveAI('one', new Date('2026-11-02T00:00:00Z'));
    await expect(reserveAI('two', new Date('2026-11-03T00:00:00Z'))).rejects.toMatchObject({ status: 429 });
    await reserveAI('one', new Date('2026-12-01T00:00:00Z'));
  });
  it('does not overshoot under concurrent requests', async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveAI('one', day)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2);
    expect((await db.aIUsage.findUnique({ where: { key: 'month:2026-11' } }))?.count).toBe(2);
  });
  it('supports zero caps and rejects invalid settings', async () => {
    vi.stubEnv('AI_MONTHLY_LIMIT', '0');
    await expect(reserveAI('one', day)).rejects.toMatchObject({ status: 429 });
    expect(limit(undefined, 20)).toBe(20);
    for (const value of ['-1', 'NaN', '2.5']) expect(() => limit(value, 20)).toThrow();
  });
});
