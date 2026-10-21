// Pure news selection logic: topics come from the student's choice, else their interests.
import { CHECK_TTL_DAYS, DAY, cutoffDay, utcDay, canonicalUrl } from './news-ingestion.js';
import { NEWS_SOURCES } from '../news/sources.js';
import { INTEREST_TO_TOPIC, NEWS_TOPICS } from '../data/news.js';
export interface Story { id: string; topic: string; headline: string; summary: string; source: string; url: string; publishedAt: string; checkedAt?: Date; isSample?: boolean; sourceId?: string; safetyFlags?: string; moderationStatus?: string; contentHash?: string; reviewedAt?: Date | null }

export function effectiveTopics(interests: string[], chosen?: string[] | null): { topics: string[]; custom: boolean } {
  const valid = (chosen || []).filter(t => (NEWS_TOPICS as readonly string[]).includes(t));
  if (valid.length) return { topics: valid, custom: true };
  const derived = [...new Set(interests.map(i => INTEREST_TO_TOPIC[i]).filter(Boolean))];
  return { topics: derived.length ? derived : ['Space', 'Science', 'AI & Tech'], custom: false };
}

/** Stories in the student's topics, newest first. Only stories with a source and URL are ever returned. */
export function canShowStory(s: Story, now = new Date()): boolean {
  const source = NEWS_SOURCES.find(x => x.id === s.sourceId);
  if (!source || s.source !== source.name || s.isSample !== false || s.moderationStatus !== 'approved' || !s.reviewedAt || !/^[a-f0-9]{64}$/.test(s.contentHash || '') || !s.checkedAt || s.safetyFlags !== '[]' || s.topic !== source.topic) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.publishedAt) || s.publishedAt < cutoffDay(now) || s.publishedAt > utcDay(now)) return false;
  if (!Number.isFinite(+new Date(s.publishedAt))) return false;
  if (!Number.isFinite(+s.reviewedAt) || +s.reviewedAt > +now || new Date(s.publishedAt).toISOString().slice(0, 10) !== s.publishedAt) return false;
  if (!Number.isFinite(+s.checkedAt) || +s.checkedAt < +now - CHECK_TTL_DAYS * DAY || +s.checkedAt > +now) return false;
  try { return canonicalUrl(s.url, source) === s.url && !!s.headline; } catch { return false; }
}

export function selectStories(stories: Story[], topics: string[], now = new Date()) {
  const ok = stories.filter(s => canShowStory(s, now));
  const mine = ok.filter(s => topics.includes(s.topic)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const top = mine[0] || [...ok].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] || null;
  return { stories: mine, top, personal: !!mine[0], emptyTopics: topics.filter(t => !mine.some(s => s.topic === t)) };
}

