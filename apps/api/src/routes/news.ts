import { FastifyInstance } from 'fastify';
import { prisma, j } from '../lib/db.js';
import { requireStudent } from '../lib/auth.js';
import { effectiveTopics, selectStories } from '../domain/news.js';
import { NEWS_TOPICS } from '../data/news.js';
import {env} from '../lib/env.js';
import {refreshNews} from '../lib/news-refresh.js';
import {audit} from '../lib/audit.js';

async function newsFor(s:{settings:string;interests:string}) {
  const settings=j<{newsTopics?:string[]|null}>(s.settings,{}),{topics,custom}=effectiveTopics(j<string[]>(s.interests,[]),settings.newsTopics);
  const all=await prisma.newsStory.findMany({where:env.demoMode?{}:{isSample:false},orderBy:{publishedAt:'desc'},take:200});
  const updated=all.reduce((d:Date|null,x:{checkedAt:Date})=>(!d||x.checkedAt>d?x.checkedAt:d),null as Date|null);
  return {allTopics:NEWS_TOPICS,topics,custom,...selectStories(all,topics),updatedAt:updated};
}

export default async function routes(app: FastifyInstance) {
  // News for you: real, sourced stories filtered by the student's topics.
  app.get('/api/news', async(req,reply) => {
    reply.header('Cache-Control','no-store');
    return newsFor(await requireStudent(req));
  });
  app.post('/api/news/refresh',async(req,reply)=>{
    const s=await requireStudent(req),settings=j<{newsTopics?:string[]|null}>(s.settings,{});
    const {topics}=effectiveTopics(j<string[]>(s.interests,[]),settings.newsTopics);
    const refresh=await refreshNews(topics);
    await audit(s.id,'student','Refreshed news',refresh.status);
    reply.header('Cache-Control','no-store');
    return {...await newsFor(s),refresh};
  });
}
