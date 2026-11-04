import {randomUUID} from 'node:crypto';
import {NEWS_FEEDS} from '../data/news-feeds.js';
import {parseNewsFeed} from '../domain/news-feed.js';
import {prisma} from './db.js';
import {fetchNewsFeed} from './news-fetch.js';

/** Explicit student action; public feed cache shared across students/instances. */
export async function refreshNews(topics:string[],now=new Date()) {
  const results=await Promise.all(NEWS_FEEDS.filter(f=>topics.includes(f.topic)).map(async feed=>{
    const key='news-feed:'+feed.id,owner=randomUUID();
    await prisma.jobLease.upsert({where:{key},create:{key,expiresAt:new Date(0)},update:{}});
    const claim=await prisma.jobLease.updateMany({where:{key,expiresAt:{lte:now}},data:{owner,expiresAt:new Date(+now+15*60000)}});
    if(!claim.count)return {feed:feed.id,state:'cached',saved:0,reason:null};
    let stage:'fetch'|'parse'|'save'='fetch';
    try {
      const xml=await fetchNewsFeed(feed);stage='parse';
      const stories=parseNewsFeed(xml,feed,now);
      if(!stories.length)throw new Error('No recent feed entries');
      stage='save';
      await prisma.$transaction(stories.map(story=>prisma.newsStory.upsert({where:{id:story.id},create:{...story,checkedAt:now,isSample:false},update:{...story,checkedAt:now,isSample:false}})));
      return {feed:feed.id,state:'refreshed',saved:stories.length,reason:null};
    } catch(e) {
      // A short persistent backoff prevents a broken feed being hammered.
      await prisma.jobLease.updateMany({where:{key,owner},data:{expiresAt:new Date(+now+60000)}});
      const reason=stage==='save'?'storage':stage==='parse'?'unreadable_or_empty_feed':e instanceof Error&&/timed out|abort/i.test(e.message)?'timeout':'source_unavailable';
      return {feed:feed.id,state:'failed',saved:0,reason};
    }
  }));
  const succeeded=results.filter(r=>r.state==='refreshed').length,failed=results.filter(r=>r.state==='failed').length;
  return {status:succeeded?(failed?'partial':'refreshed'):failed?'unavailable':'cached',succeeded,failed,skipped:results.filter(r=>r.state==='cached').length,saved:results.reduce((n,r)=>n+r.saved,0),feeds:results};
}
