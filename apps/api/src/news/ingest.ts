import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { cutoffDay, normalizeItem } from '../domain/news-ingestion.js';
import { retrieveFeed, verifyLink, type Fetcher } from './feed.js';
import type { NewsSource } from './sources.js';

export interface SourceReport {
  sourceId: string; status: 'ok' | 'failed'; fetched: number; stored: number; rejected: number; duplicates: number; linkFailures: number;
  errors: string[];
}
export async function ingestNews(db: PrismaClient, sources: NewsSource[], options: {
  now?: Date; fetcher?: Fetcher; dryRun?: boolean;
} = {}) {
  if (!sources.length) throw new Error('No news sources configured');
  const now = options.now || new Date(), fetcher = options.fetcher || fetch;
  const dryRun = !!options.dryRun, token = randomUUID();
  const signal = AbortSignal.timeout(240_000);
  let runId: string | undefined;
  if (!dryRun) {
    // Compare-and-set acquisition works on SQLite and Postgres. Never delete another owner's lease.
    await db.newsJobLease.upsert({ where: { id: 'news' }, update: {}, create: { id: 'news', token: '', expiresAt: new Date(0) } });
    const acquired = await db.newsJobLease.updateMany({ where: { id: 'news', expiresAt: { lte: now } },
      data: { token, expiresAt: new Date(+now + 15 * 60_000) } });
    if (!acquired.count) throw new Error('News ingestion already running');
  }
  const reports: SourceReport[] = [];
  const seenUrls = new Set<string>(), seenTitles = new Set<string>();
  let pruned = 0;
  try {
    if (!dryRun) runId = (await db.newsIngestionRun.create({ data: { startedAt: now } })).id;
    for (const source of sources) {
      const report: SourceReport = { sourceId: source.id, status: 'ok', fetched: 0, stored: 0, rejected: 0, duplicates: 0, linkFailures: 0, errors: [] };
      reports.push(report);
      let items;
      try { items = await retrieveFeed(source, fetcher, signal); }
      catch (error) { report.status = 'failed'; report.errors.push(message(error)); continue; }
      report.fetched = items.length;
      for (const item of items) {
        let story;
        try { story = normalizeItem(item, source, now); }
        catch { report.rejected++; continue; }
        if (seenUrls.has(story.url) || seenTitles.has(story.fingerprint)) { report.duplicates++; continue; }
        // A title duplicate at a different URL must not refresh the original article's verification time.
        const existing = await db.newsStory.findFirst({ where: { OR: [{ id: story.id }, { fingerprint: story.fingerprint }, { url: story.url }] } });
        if (existing && existing.url !== story.url) { report.duplicates++; continue; }
        try { await verifyLink(story.url, source, fetcher, signal); }
        catch (error) {
          report.linkFailures++;
          if (report.errors.length < 3) report.errors.push(`Link check failed: ${message(error)}`);
          if (!dryRun && existing) await db.newsStory.update({ where: { id: existing.id }, data: {
            moderationStatus: 'pending', reviewedAt: null, reviewedBy: null,
          } });
          continue;
        }
        seenUrls.add(story.url); seenTitles.add(story.fingerprint);
        if (!dryRun) {
          const unchanged = existing?.contentHash === story.contentHash;
          const data = { ...story,
            moderationStatus: unchanged ? existing.moderationStatus : story.moderationStatus,
            reviewedAt: unchanged ? existing.reviewedAt : null,
            reviewedBy: unchanged ? existing.reviewedBy : null,
          };
          // Use old id for legacy URL matches; immutable primary key for new canonical URL ids.
          await db.newsStory.upsert({ where: { id: existing?.id || story.id },
            create: data, update: { ...data, id: existing?.id || story.id } });
        }
        report.stored++;
      }
      if (report.linkFailures || (!report.stored && !report.duplicates)) {
        report.status = 'failed';
        if (!report.stored && !report.duplicates) report.errors.push('No usable recent articles returned');
      }
    }
    if (!dryRun) {
      pruned = (await db.newsStory.deleteMany({ where: { publishedAt: { lt: cutoffDay(now) } } })).count;
      // Operational logs are bounded too; reviews retained 90 days for incident investigation.
      await db.newsIngestionRun.deleteMany({ where: { startedAt: { lt: new Date(+now - 90 * 864e5) } } });
      await db.newsReview.deleteMany({ where: { at: { lt: new Date(+now - 90 * 864e5) } } });
    }
    const failures = reports.filter(r => r.status === 'failed').length;
    const status = failures === reports.length ? 'failed' : failures ? 'partial' : 'ok';
    const result = { status, dryRun, reports, pruned };
    if (runId) await db.newsIngestionRun.update({ where: { id: runId }, data: { status, finishedAt: new Date(), report: JSON.stringify(result) } });
    return result;
  } catch (error) {
    if (runId) await db.newsIngestionRun.update({ where: { id: runId }, data: {
      status: 'failed', finishedAt: new Date(), report: JSON.stringify({ error: message(error), reports }),
    } });
    throw error;
  } finally {
    if (!dryRun) await db.newsJobLease.updateMany({ where: { id: 'news', token }, data: { expiresAt: new Date(0) } });
  }
}
function message(error: unknown) { return error instanceof Error ? error.message.slice(0, 200) : 'Source failure'; }
