import { createHash } from 'node:crypto';
import type { NewsSource } from '../news/sources.js';

export const DAY = 86_400_000;
export const RETENTION_DAYS = 30;
export const CHECK_TTL_DAYS = 3;
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const utcDay = (now: Date) => now.toISOString().slice(0, 10);
export const cutoffDay = (now: Date) => utcDay(new Date(+now - RETENTION_DAYS * DAY));

export function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function canonicalUrl(raw: string, source: NewsSource): string {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !source.hosts.includes(u.hostname)) {
    throw new Error('Unapproved article URL');
  }
  if (u.pathname === '/' || /\/(feed|rss|news)\/?$/i.test(u.pathname)) throw new Error('Not an article URL');
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/+$/, '');
  return u.href;
}

/** Never substitute retrieval time for an absent/invalid publication time. */
export function publicationDay(value: string, now: Date): string {
  const iso = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;
  const rfc = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} (?:GMT|UT|[+-]\d{4})$/;
  if (!iso.test(value) && !rfc.test(value)) throw new Error('Missing or ambiguous publication date');
  const d = new Date(value);
  if (!Number.isFinite(+d) || (iso.test(value) && d.toISOString().slice(0, 10) !== value.slice(0, 10) && !value.includes('T'))) throw new Error('Invalid publication date');
  // Reject invalid calendar components even when JS rolls them into the next month.
  if (iso.test(value)) {
    if (value.includes('T') && Number(value.slice(11, 13)) > 23) throw new Error('Invalid hour');
    const [y, m, day] = value.slice(0, 10).split('-').map(Number);
    if (new Date(Date.UTC(y, m - 1, day)).getUTCDate() !== day || m < 1 || m > 12) throw new Error('Invalid calendar date');
  }
  if (rfc.test(value)) {
    const parts = value.split(' ');
    const day = Number(parts[1]), m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[2]), y = Number(parts[3]);
    if (new Date(Date.UTC(y, m, day)).getUTCDate() !== day || Number(parts[4].slice(0,2)) > 23) throw new Error('Invalid calendar date');
  }
  if (+d > +now || utcDay(d) < cutoffDay(now)) throw new Error('Stale or future article');
  return utcDay(d);
}

// Triage only, never a certification. Every new/changed story also requires human approval.
export function safetyFlags(text: string): string[] {
  return [
    [/\b(suicid\w*|self[- ]harm|sexual\w*|rape|porn\w*|gore|behead\w*|massacre|shooting|murder\w*)\b/i, 'sensitive-content'],
    [/\b(shocking|you won.t believe|miracle cure|guaranteed cure|buy now)\b/i, 'sensational-or-promotional'],
  ].filter(([re]) => (re as RegExp).test(text)).map(([, label]) => label as string);
}

export interface FeedItem { title: string; url: string; published: string; description: string }
export function normalizeItem(item: FeedItem, source: NewsSource, now: Date) {
  const headline = plainText(item.title);
  if (headline.length < 8 || headline.length > 240) throw new Error('Invalid headline length');
  const url = canonicalUrl(item.url, source);
  const publishedAt = publicationDay(item.published, now);
  const description = plainText(item.description).slice(0, 8000);
  const flags = safetyFlags(`${headline} ${description}`);
  const fingerprint = hash(headline.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
  const contentHash = hash(JSON.stringify([source.id, source.topic, headline, url, publishedAt, description]));
  return { id: `news-${hash(url)}`, topic: source.topic, headline, summary: '', source: source.name, sourceId: source.id,
    url, publishedAt, checkedAt: now, isSample: false, fingerprint, contentHash,
    safetyFlags: JSON.stringify(flags), moderationStatus: flags.length ? 'blocked' : 'pending' };
}
export type NormalizedStory = ReturnType<typeof normalizeItem>;
