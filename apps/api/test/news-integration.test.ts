import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import { ingestNews } from '../src/news/ingest.js';
import { reviewNews } from '../src/news/review.js';
import { NEWS_SOURCES } from '../src/news/sources.js';
import { normalizeItem } from '../src/domain/news-ingestion.js';
const now = new Date('2026-10-21T12:00:00Z');
const source = NEWS_SOURCES[0], other = NEWS_SOURCES[1];
const item = { title: 'An educational telescope discovery', url: 'https://www.nasa.gov/science/discovery', published: '2026-10-20', description: 'Research news.' };
const xml = (items = [item]) => '<rss><channel>' + items.map(x => `<item><title>${x.title}</title><link>${x.url.replace(/&/g, '&amp;')}</link><pubDate>${x.published}</pubDate><description>${x.description}</description></item>`).join('') + '</channel></rss>';
let body = xml();
const fetcher: typeof fetch = async (_url, init) => init?.method === 'HEAD' ? new Response(null, { headers: { 'content-type': 'text/html' } }) : new Response(body, { headers: { 'content-type': 'text/xml' } });
let db: PrismaClient, dir: string;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pathway-news-'));
  const url = `file:${join(dir, 'test.db')}`;
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('prisma/build/index.js'), 'db', 'push', '--schema', resolve('prisma/schema.prisma'), '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  db = new PrismaClient({ datasourceUrl: url });
}, 30000);
beforeEach(async () => {
  await db.newsStory.deleteMany(); await db.newsJobLease.deleteMany(); await db.newsIngestionRun.deleteMany(); await db.newsReview.deleteMany(); body = xml();
});
afterAll(async () => { await db?.$disconnect(); if (dir) rmSync(dir, { recursive: true, force: true }); });
const run = (extra = {}) => ingestNews(db, [source], { now, fetcher, ...extra });

describe('news ingestion against SQLite', () => {
  it('persists candidates, audits hash-bound review, and repeats idempotently', async () => {
    await run(); const first = await db.newsStory.findFirstOrThrow();
    expect(first).toMatchObject({ moderationStatus: 'pending', summary: '', isSample: false });
    await expect(reviewNews(db, first.id, '0'.repeat(64), 'approved', 'operator', now)).rejects.toThrow('changed');
    await reviewNews(db, first.id, first.contentHash, 'approved', 'operator', now);
    await run(); expect(await db.newsStory.count()).toBe(1);
    expect((await db.newsStory.findFirstOrThrow()).moderationStatus).toBe('approved');
    expect(await db.newsReview.count()).toBe(1); expect(await db.newsIngestionRun.count()).toBe(2);
    body = xml([{ ...item, description: 'A material update to the story.' }]);
    await run(); expect(await db.newsStory.findFirstOrThrow()).toMatchObject({ moderationStatus: 'pending', reviewedAt: null, reviewedBy: null });
  });
  it('deduplicates canonical URLs, normalized headlines and repeated runs', async () => {
    body = xml([item, { ...item, url: item.url + '?utm_source=mail' }, { ...item, url: 'https://www.nasa.gov/elsewhere', title: item.title.toUpperCase() + '!' }]);
    expect((await run()).reports[0].duplicates).toBe(2);
    await run(); expect(await db.newsStory.count()).toBe(1);
  });
  it('isolates source failures and preserves unexpired records without refreshing them', async () => {
    await run(); const first = await db.newsStory.findFirstOrThrow();
    const result = await ingestNews(db, [source, other], { now, fetcher: async (url, init) => {
      if (String(url).includes('nsf.gov')) return new Response('', { status: 503 });
      return fetcher(url, init);
    } });
    expect(result.status).toBe('partial'); expect(await db.newsStory.count()).toBe(1);
    const fail = await run({ fetcher: async () => { throw new Error('network unavailable'); } });
    expect(fail.status).toBe('failed');
    expect((await db.newsStory.findFirstOrThrow()).checkedAt).toEqual(first.checkedAt);
    expect((await db.newsIngestionRun.findFirstOrThrow({ orderBy: { startedAt: 'desc' } })).finishedAt).not.toBeNull();
  });
  it('rejects missing dates, stale dates and sensitive stories from publication', async () => {
    body = xml([{ ...item, published: '' }, { ...item, published: '2026-09-01' }, { ...item, title: 'Shocking shooting news today' }]);
    const result = await run(); expect(result.reports[0].rejected).toBe(2);
    const row = await db.newsStory.findFirstOrThrow(); expect(row.moderationStatus).toBe('blocked');
    await expect(reviewNews(db, row.id, row.contentHash, 'approved', 'operator', now)).rejects.toThrow('flagged');
  });
  it('revokes visibility for a failed link without claiming a new verification', async () => {
    await run(); const first = await db.newsStory.findFirstOrThrow();
    await reviewNews(db, first.id, first.contentHash, 'approved', 'operator', now);
    const result = await run({ fetcher: async (url: any, init: any) => init?.method === 'HEAD' ? new Response('', { status: 404 }) : fetcher(url, init) });
    expect(result.status).toBe('failed');
    expect(await db.newsStory.findFirstOrThrow()).toMatchObject({ moderationStatus: 'pending', checkedAt: first.checkedAt });
  });
  it('prunes expired rows during an outage; dry runs never write or prune', async () => {
    const old = { ...normalizeItem(item, source, now), publishedAt: '2026-09-01' };
    await db.newsStory.create({ data: old });
    await run({ dryRun: true });
    expect(await db.newsStory.count()).toBe(1); expect(await db.newsIngestionRun.count()).toBe(0); expect(await db.newsJobLease.count()).toBe(0);
    expect((await run({ fetcher: async () => { throw new Error('offline'); } })).pruned).toBe(1);
  });
  it('rejects overlap and takes over only expired leases', async () => {
    await db.newsJobLease.create({ data: { id: 'news', token: 'someone-else', expiresAt: new Date(+now + 1000) } });
    await expect(run()).rejects.toThrow('already running');
    expect((await db.newsJobLease.findUniqueOrThrow({ where: { id: 'news' } })).token).toBe('someone-else');
    await db.newsJobLease.update({ where: { id: 'news' }, data: { expiresAt: new Date(0) } });
    await run(); expect((await db.newsJobLease.findUniqueOrThrow({ where: { id: 'news' } })).expiresAt).toEqual(new Date(0));
  });
  it('rolls back a failed review audit with its publication change', async () => {
    await run(); const row = await db.newsStory.findFirstOrThrow();
    const failingAudit = { $transaction: async (fn: any) => db.$transaction(async (tx: any) => {
      const proxy = new Proxy(tx, { get(target, key) { return key === 'newsReview' ? { create: async () => { throw new Error('audit failure'); } } : target[key]; } });
      return fn(proxy);
    }) } as unknown as PrismaClient;
    await expect(reviewNews(failingAudit, row.id, row.contentHash, 'approved', 'operator', now)).rejects.toThrow('audit failure');
    expect((await db.newsStory.findFirstOrThrow()).moderationStatus).toBe('pending');
  });
  it('serves only reviewed fresh personalized stories through the actual route', async () => {
    await run(); const row = await db.newsStory.findFirstOrThrow();
    await reviewNews(db, row.id, row.contentHash, 'approved', 'operator', now);
    await db.newsStory.create({ data: { ...normalizeItem({ ...item, title: 'Another pending discovery', url: 'https://www.nasa.gov/another' }, source, now), id: 'pending' } });
    vi.doMock('../src/lib/db.js', () => ({ prisma: db, j: (s: string, fallback: unknown) => s ? JSON.parse(s) : fallback }));
    let settings = { newsTopics: ['Space'] };
    vi.doMock('../src/lib/auth.js', () => ({ requireStudent: async () => ({ interests: '["AI"]', settings: JSON.stringify(settings) }) }));
    const routes = (await import('../src/routes/news.js')).default;
    const app = Fastify(); await app.register(routes);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    try {
      const response = (await app.inject('/api/news')).json();
      expect(response.stories.map((x: any) => x.id)).toEqual([row.id]); expect(response.custom).toBe(true);
      expect(response.stories[0]).not.toHaveProperty('reviewedBy');
      expect(response.stories[0]).not.toHaveProperty('contentHash');
      expect(response.stories[0].checkedAt).toBe(now.toISOString());
      settings = { newsTopics: ['Sports'] };
      expect((await app.inject('/api/news')).json()).toMatchObject({ stories: [], personal: false, emptyTopics: ['Sports'] });
      vi.setSystemTime(new Date(+now + 4 * 864e5));
      expect((await app.inject('/api/news')).json()).toMatchObject({ stories: [], top: null, updatedAt: null });
    } finally { vi.useRealTimers(); await app.close(); vi.doUnmock('../src/lib/db.js'); vi.doUnmock('../src/lib/auth.js'); }
  });
});
