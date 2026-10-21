import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { FeedItem } from '../domain/news-ingestion.js';
import type { NewsSource } from './sources.js';

export const MAX_BYTES = 1_000_000;
export const MAX_ITEMS = 20;
const list = (x: unknown): any[] => x == null ? [] : Array.isArray(x) ? x : [x];
const str = (x: any): string => typeof x === 'string' ? x : typeof x?.['#text'] === 'string' ? x['#text'] : '';

export function parseFeed(xml: string): FeedItem[] {
  if (Buffer.byteLength(xml) > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsafe or oversized XML');
  if (XMLValidator.validate(xml) !== true) throw new Error('Malformed feed XML');
  const doc = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true,
    processEntities: true, removeNSPrefix: true }).parse(xml);
  const rss = doc.rss?.channel;
  const atom = doc.feed;
  const isRss = rss !== undefined;
  if (!isRss && atom === undefined) throw new Error('Expected RSS 2.0 or Atom feed');
  return list(isRss ? rss?.item : atom?.entry).slice(0, MAX_ITEMS).map(x => ({
    title: str(x.title),
    url: isRss ? str(x.link) : str(list(x.link).find(l => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href']),
    published: str(isRss ? x.pubDate : x.published), // Atom updated is not a publication date.
    description: str(isRss ? x.description : x.summary),
  }));
}

export type Fetcher = typeof fetch;
/** Follow at most two redirects, validating the exact publisher host at every hop. */
export async function request(url: string, source: NewsSource, fetcher: Fetcher, method: 'GET' | 'HEAD', signal?: AbortSignal) {
  const timeout = AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]);
  for (let redirects = 0; redirects <= 2; redirects++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !source.hosts.includes(u.hostname)) throw new Error('Unapproved fetch URL');
    const response = await fetcher(url, { method, redirect: 'manual', signal: timeout,
      headers: { 'User-Agent': 'PathwayAI-News/0.1', Accept: method === 'GET' ? 'application/rss+xml, application/atom+xml, application/xml, text/xml' : 'text/html' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects === 2) throw new Error('Invalid or excessive source redirects');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Source HTTP ${response.status}`); }
    return response;
  }
  throw new Error('Excessive redirects');
}
export async function retrieveFeed(source: NewsSource, fetcher: Fetcher, signal?: AbortSignal) {
  const response = await request(source.feedUrl, source, fetcher, 'GET', signal);
  const type = response.headers.get('content-type') || '';
  if (!/\b(?:xml|rss|atom)\b/i.test(type)) { await response.body?.cancel(); throw new Error('Unexpected feed content type'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty feed body');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Oversized feed body');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return parseFeed(Buffer.concat(chunks).toString('utf8'));
}
export async function verifyLink(url: string, source: NewsSource, fetcher: Fetcher, signal?: AbortSignal) {
  const response = await request(url, source, fetcher, 'HEAD', signal);
  await response.body?.cancel();
  if (!/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('Article is not HTML');
}
