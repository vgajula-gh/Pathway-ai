import { FastifyInstance } from 'fastify';
import { prisma, j } from '../lib/db.js';
import { requireStudent } from '../lib/auth.js';
import { effectiveTopics, selectStories, type Story } from '../domain/news.js';
import { cutoffDay, utcDay, DAY, CHECK_TTL_DAYS } from '../domain/news-ingestion.js';
import { NEWS_TOPICS } from '../data/news.js';

export default async function routes(app: FastifyInstance) {
  // News for you: real, sourced stories filtered by the student's topics.
  app.get('/api/news', async req => {
    const s = await requireStudent(req), settings = j<{ newsTopics?: string[] | null }>(s.settings, {});
    const { topics, custom } = effectiveTopics(j<string[]>(s.interests, []), settings.newsTopics);
    const now = new Date();
    const all = await prisma.newsStory.findMany({ where: { isSample: false, moderationStatus: 'approved', publishedAt: { gte: cutoffDay(now), lte: utcDay(now) }, checkedAt: { gte: new Date(+now - CHECK_TTL_DAYS * DAY), lte: now } }, orderBy: { publishedAt: 'desc' } });
    const sel = selectStories(all, topics, now);
    const updated = [...sel.stories, ...(sel.top ? [sel.top] : [])].reduce((d: Date | null, x: { checkedAt?: Date }) => (x.checkedAt && (!d || x.checkedAt > d) ? x.checkedAt : d), null as Date | null);
    const publicStory = ({ id, topic, headline, summary, source, url, publishedAt, checkedAt }: Story) => ({ id, topic, headline, summary, source, url, publishedAt, checkedAt });
    return { allTopics: NEWS_TOPICS, topics, custom, ...sel, stories: sel.stories.map(publicStory), top: sel.top ? publicStory(sel.top) : null, updatedAt: updated };
  });
}

