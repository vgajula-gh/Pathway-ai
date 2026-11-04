import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import type {NewsFeed} from '../data/news-feeds.js';

const plain=(value:string,max:number)=>{
  const $=load(value);$('script,style').remove();return $.text().replace(/\s+/g,' ').trim().slice(0,max);
};
export function articleUrl(value:string,feed:NewsFeed) {
  try {
    const url=new URL(value,feed.url);
    if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!feed.articleDomains.some(d=>url.hostname===d||url.hostname.endsWith('.'+d)))return null;
    url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
    return url.href;
  } catch {return null;}
}
/** Bounded RSS/Atom metadata only; never invent a headline, date or summary. */
export function parseNewsFeed(xml:string,feed:NewsFeed,now=new Date()) {
  if(Buffer.byteLength(xml)>1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported news feed');
  const $=load(xml,{xmlMode:true});
  if(!$('rss,feed').length)throw new Error('Not a news feed');
  const stories=new Map<string,{id:string;topic:string;headline:string;summary:string;source:string;url:string;publishedAt:string}>();
  $('item,entry').slice(0,50).each((_i,node)=>{
    const item=$(node),headline=plain(item.find('title').first().text(),240);
    const rawUrl=item.find('link[rel="alternate"]').attr('href')||item.find('link').first().attr('href')||item.find('link').first().text();
    const url=articleUrl(rawUrl,feed),published=new Date(item.find('pubDate,published,dc\\:date').first().text());
    if(!headline||!url||!Number.isFinite(+published)||+published>+now+300000||+published<+now-30*864e5)return;
    stories.set(url,{id:'feed-'+createHash('sha256').update(url).digest('hex'),topic:feed.topic,headline,summary:plain(item.find('description,summary').first().text(),500),source:feed.source,url,publishedAt:published.toISOString().slice(0,10)});
  });
  return [...stories.values()].slice(0,30);
}
