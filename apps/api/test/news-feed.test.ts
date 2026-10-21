import { describe, it, expect, vi } from 'vitest';
import { parseFeed, retrieveFeed, verifyLink, MAX_BYTES } from '../src/news/feed.js';
import { NEWS_SOURCES } from '../src/news/sources.js';
const source = NEWS_SOURCES[0];
const rss = '<rss><channel><item><title>A &amp; B</title><link>https://www.nasa.gov/a</link><pubDate>Tue, 20 Oct 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Science</p>]]></description></item></channel></rss>';
describe('bounded RSS/Atom retrieval', () => {
  it('parses RSS, entities, CDATA, and empty feeds', () => {
    expect(parseFeed(rss)[0]).toMatchObject({ title: 'A & B', description: '<p>Science</p>' });
    expect(parseFeed('<rss><channel/></rss>')).toEqual([]);
  });
  it('parses Atom alternate links but does not use updated as publication time', () => {
    expect(parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Science news</title><link rel="self" href="bad"/><link rel="alternate" href="https://www.nasa.gov/a"/><updated>2026-10-20</updated></entry></feed>')[0]).toMatchObject({ url: 'https://www.nasa.gov/a', published: '' });
  });
  it.each(['<broken>', '<html/>', '<!DOCTYPE rss [<!ENTITY x "evil">]><rss><channel/></rss>', 'x'.repeat(MAX_BYTES + 1)])('rejects malformed, unknown, entity-bearing and oversized input', xml => expect(() => parseFeed(xml)).toThrow());
  it('bounds entries and verifies redirect policy', async () => {
    const fetcher = vi.fn(async () => new Response(rss, { headers: { 'content-type': 'application/rss+xml' } }));
    expect(await retrieveFeed(source, fetcher)).toHaveLength(1);
    expect(fetcher.mock.calls[0]).toHaveLength(2);
    expect((fetcher.mock.calls as any)[0][1]).toMatchObject({ redirect: 'manual', method: 'GET' });
    expect(parseFeed('<rss><channel>' + '<item><title>Test</title></item>'.repeat(50) + '</channel></rss>')).toHaveLength(20);
  });
  it('rejects HTTP failures, HTML masquerading as feeds, oversize streams and bad article types', async () => {
    for (const response of [new Response('bad', { status: 503 }), new Response(rss, { headers: { 'content-type': 'text/html' } }), new Response('x'.repeat(MAX_BYTES + 1), { headers: { 'content-type': 'text/xml' } })]) {
      await expect(retrieveFeed(source, async () => response)).rejects.toThrow();
    }
    await expect(verifyLink('https://www.nasa.gov/a', source, async () => new Response('', { headers: { 'content-type': 'application/pdf' } }))).rejects.toThrow();
  });
  it('allows bounded publisher redirects but rejects off-host redirects and loops', async () => {
    const redirected = vi.fn(async (url: any) => String(url).endsWith('/a')
      ? new Response(null, { status: 301, headers: { location: '/a/' } })
      : new Response(null, { headers: { 'content-type': 'text/html' } }));
    await verifyLink('https://www.nasa.gov/a', source, redirected);
    expect(redirected).toHaveBeenCalledTimes(2);
    const evil = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/a' } }));
    await expect(verifyLink('https://www.nasa.gov/a', source, evil)).rejects.toThrow('Unapproved');
    expect(evil).toHaveBeenCalledTimes(1);
    const loop = vi.fn(async () => new Response(null, { status: 301, headers: { location: '/loop' } }));
    await expect(verifyLink('https://www.nasa.gov/a', source, loop)).rejects.toThrow('excessive');
    expect(loop).toHaveBeenCalledTimes(3);
  });
  it('propagates timeouts and never fetches unapproved hosts', async () => {
    await expect(retrieveFeed(source, async () => { throw new DOMException('timed out', 'TimeoutError'); })).rejects.toThrow('timed out');
    const fetcher = vi.fn();
    await expect(verifyLink('https://evil.example/a', source, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
