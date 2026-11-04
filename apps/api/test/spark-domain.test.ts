import {describe,it,expect} from 'vitest';
import {parseNewsFeed,articleUrl} from '../src/domain/news-feed.js';
import {NEWS_FEEDS} from '../src/data/news-feeds.js';
import {WORDS} from '../src/data/words.js';
import {practiceWord} from '../src/domain/words.js';
import {wallNow} from '../src/domain/time.js';
const feed=NEWS_FEEDS[0],now=new Date('2030-01-08T01:00:00Z');
const item=(url='https://www.nasa.gov/article/one',date='Mon, 07 Jan 2030 12:00:00 GMT')=>`<item><title><![CDATA[A &amp; B]]></title><link>${url}</link><description><![CDATA[<p>Real <b>publisher</b> summary.</p><script>bad()</script>]]></description><pubDate>${date}</pubDate></item>`;
describe('source-backed news feed metadata',()=>{
  it('parses RSS, strips markup, preserves publisher attribution and deduplicates links',()=>{
    const rows=parseNewsFeed(`<rss><channel>${item()}${item('https://www.nasa.gov/article/one?utm_source=feed#text')}</channel></rss>`,feed,now);
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({headline:'A & B',summary:'Real publisher summary.',url:'https://www.nasa.gov/article/one',source:'NASA',topic:'Space',publishedAt:'2030-01-07'});
    expect(rows[0].id).toMatch(/^feed-[a-f0-9]{64}$/);
  });
  it('parses Atom alternate links and dated entries',()=>{
    const rows=parseNewsFeed('<feed><entry><title>Publisher headline</title><link rel="alternate" href="https://www.nasa.gov/article/atom"/><published>2030-01-07T12:00:00Z</published><summary>Short summary</summary></entry></feed>',feed,now);
    expect(rows[0]).toMatchObject({headline:'Publisher headline',summary:'Short summary'});
  });
  it('skips unsafe links, missing dates, future articles and old articles without invented replacements',()=>{
    const xml=`<rss><channel>${item('javascript:alert(1)')}${item('https://nasa.gov.evil.test/one')}${item('https://www.nasa.gov/one','')}${item('https://www.nasa.gov/one','2040-01-01')}${item('https://www.nasa.gov/one','2029-01-01')}</channel></rss>`;
    expect(parseNewsFeed(xml,feed,now)).toEqual([]);
    for(const url of ['http://www.nasa.gov/a','https://user:pass@nasa.gov/a','https://127.0.0.1/a','https://nasa.gov:444/a'])expect(articleUrl(url,feed)).toBeNull();
  });
  it('rejects oversized or entity-bearing payloads and non-feed HTML',()=>{
    for(const xml of ['<html>Not a feed</html>','<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>','x'.repeat(1024*1024+1)])expect(()=>parseNewsFeed(xml,feed,now)).toThrow();
  });
  it('bounds ingestion even when a publisher returns many items',()=>{
    expect(parseNewsFeed('<rss>'+Array.from({length:100},(_,i)=>item('https://www.nasa.gov/article/'+i)).join('')+'</rss>',feed,now)).toHaveLength(30);
  });
});
describe('vocabulary practice',()=>{
  it('offers a distinct word on every step before repeating the full curated set',()=>{
    expect(WORDS).toHaveLength(500);expect(new Set(WORDS.map(w=>w[0])).size).toBe(WORDS.length);
    const seen=Array.from({length:WORDS.length},(_,i)=>practiceWord(now,i).word.word);
    expect(new Set(seen).size).toBe(WORDS.length);expect(practiceWord(now,WORDS.length).word.word).toBe(seen[0]);
    expect(practiceWord(now,1)).toMatchObject({position:2,total:500});
  });
  it('anchors the daily word to the supplied student-local calendar date',()=>{
    const local=wallNow('America/New_York',now);
    expect(practiceWord(local).date).toBe('2030-01-07');
    expect(practiceWord(local).word.word).not.toBe(practiceWord(now).word.word);
    for(const [word,pos,meaning,example] of WORDS){
      expect(word).toMatch(/^[a-z]+$/);
      expect(['noun','verb','adjective','adverb','conjunction']).toContain(pos);
      expect(meaning.length).toBeGreaterThanOrEqual(10);
      expect(example.length).toBeGreaterThanOrEqual(20);
      expect(example.toLowerCase()).toContain(word);
    }
  });
});
