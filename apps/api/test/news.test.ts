import { describe, it, expect } from 'vitest';
import { effectiveTopics, selectStories, canShowStory } from '../src/domain/news.js';
import { normalizeItem, canonicalUrl, publicationDay, cutoffDay, DAY } from '../src/domain/news-ingestion.js';
import { NEWS_SOURCES, configuredSources } from '../src/news/sources.js';
const now = new Date('2026-10-21T12:00:00Z');
const source = NEWS_SOURCES[0];
const raw = { title: 'A new telescope discovery', url: 'https://www.nasa.gov/science/discovery/', published: '2026-10-20', description: 'An educational discovery.' };
const approved = { ...normalizeItem(raw, source, now), moderationStatus: 'approved', reviewedAt: now };

describe('news for you', () => {
  it('derives topics and respects explicit choices', () => {
    expect(effectiveTopics(['AI', 'Coding']).topics).toEqual(['AI & Tech']);
    expect(effectiveTopics(['AI'], ['Space'])).toEqual({ topics: ['Space'], custom: true });
    expect(effectiveTopics([]).topics.length).toBe(3);
  });
  it('sorts and reports empty topics while preserving the general top fallback', () => {
    const older = { ...approved, id: 'older', publishedAt: '2026-10-19' };
    expect(selectStories([older, approved], ['Space', 'Sports'], now).stories.map(x => x.id)).toEqual([approved.id, 'older']);
    const fallback = selectStories([approved], ['Sports'], now);
    expect(fallback).toMatchObject({ stories: [], top: approved, personal: false, emptyTopics: ['Sports'] });
  });
  it.each([
    { source: '' }, { url: 'http://www.nasa.gov/article' }, { isSample: true }, { moderationStatus: 'pending' },
    { moderationStatus: 'blocked' }, { checkedAt: new Date(+now - 3 * DAY - 1) }, { checkedAt: new Date(+now + 1) },
    { publishedAt: '2026-09-20' }, { publishedAt: '2026-10-22' }, { publishedAt: '2026-09-31' },
    { reviewedAt: null }, { sourceId: 'untrusted' }, { contentHash: '' }, { safetyFlags: '["sensitive-content"]' },
  ])('hides unsafe/unreviewed/stale rows: %o', patch => {
    expect(canShowStory({ ...approved, ...patch }, now)).toBe(false);
    expect(selectStories([{ ...approved, ...patch }], ['Space'], now).top).toBeNull();
  });
  it('accepts exact freshness boundaries', () => {
    expect(canShowStory({ ...approved, publishedAt: cutoffDay(now), checkedAt: new Date(+now - 3 * DAY) }, now)).toBe(true);
  });
});
describe('ingestion normalization', () => {
  it('canonicalizes tracking, fragments, slashes and parameter ordering', () => {
    expect(canonicalUrl(raw.url + '?utm_source=mail&b=2&a=1#top', source)).toBe('https://www.nasa.gov/science/discovery?a=1&b=2');
    expect(normalizeItem(raw, source, now).id).toBe(normalizeItem({ ...raw, url: raw.url + '?utm_source=x' }, source, now).id);
  });
  it.each(['https://www.nasa.gov.evil.com/a', 'https://localhost/a', 'https://127.0.0.1/a', 'http://www.nasa.gov/a', 'https://u:p@www.nasa.gov/a', 'https://www.nasa.gov:444/a', 'https://www.nasa.gov/'])('rejects unsafe URL %s', url => expect(() => canonicalUrl(url, source)).toThrow());
  it.each(['', 'yesterday', '10/20/2026', '2026-02-30', '2026-10-20T24:00:00Z', '2026-10-22', '2026-09-20', 'Fri, 30 Feb 2026 12:00:00 GMT'])('rejects ambiguous, invalid, stale or future date %s', date => expect(() => publicationDay(date, now)).toThrow());
  it('accepts RFC and ISO times, preserving the source publication date', () => {
    expect(publicationDay('Tue, 20 Oct 2026 12:00:00 GMT', now)).toBe('2026-10-20');
    expect(publicationDay('2026-10-20T12:00:00Z', now)).toBe('2026-10-20');
  });
  it('strips markup, flags sensitive material and leaves summaries empty', () => {
    const n = normalizeItem({ ...raw, title: '<b>New telescope discovery</b>', description: 'Shocking shooting incident' }, source, now);
    expect(n.headline).toBe('New telescope discovery');
    expect(n.summary).toBe(''); expect(n.moderationStatus).toBe('blocked');
  });
  it('dedupes normalized headlines across sources and hashes material changes', () => {
    const a = normalizeItem(raw, source, now);
    const b = normalizeItem({ ...raw, title: 'A NEW telescope discovery!!!', description: 'Changed' }, source, now);
    expect(a.fingerprint).toBe(b.fingerprint); expect(a.contentHash).not.toBe(b.contentHash);
  });
  it('requires explicit supported source configuration', () => {
    expect(() => configuredSources('')).toThrow(); expect(() => configuredSources('evil')).toThrow();
    expect(configuredSources('nasa,nasa,nsf')).toHaveLength(2);
  });
});
