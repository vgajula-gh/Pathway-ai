import { FastifyInstance } from 'fastify';
import { prisma, j } from '../lib/db.js';
import { requireStudent } from '../lib/auth.js';
import { effectiveTopics, selectStories } from '../domain/news.js';
import { NEWS_TOPICS } from '../data/news.js';

export default async function routes(app: FastifyInstance) {
  // News for you: real, sourced stories filtered by the student's topics.
  app.get('/api/news', async req => {
    const s = await requireStudent(req), settings = j<{ newsTopics?: string[] | null }>(s.settings, {});
    const { topics, custom } = effectiveTopics(j<string[]>(s.interests, []), settings.newsTopics);
    const all = await prisma.newsStory.findMany({ orderBy: { publishedAt: 'desc' }, take: 200 });
    const sel = selectStories(all, topics);
    const updated = all.reduce((d: Date | null, x: { checkedAt: Date }) => (!d || x.checkedAt > d ? x.checkedAt : d), null as Date | null);
    return { allTopics: NEWS_TOPICS, topics, custom, ...sel, updatedAt: updated };
  });
}
