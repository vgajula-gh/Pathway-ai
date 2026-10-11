// Pure news selection logic: topics come from the student's choice, else their interests.
import { INTEREST_TO_TOPIC, NEWS_TOPICS } from '../data/news.js';
export interface Story { id: string; topic: string; headline: string; summary: string; source: string; url: string; publishedAt: string }

export function effectiveTopics(interests: string[], chosen?: string[] | null): { topics: string[]; custom: boolean } {
  const valid = (chosen || []).filter(t => (NEWS_TOPICS as readonly string[]).includes(t));
  if (valid.length) return { topics: valid, custom: true };
  const derived = [...new Set(interests.map(i => INTEREST_TO_TOPIC[i]).filter(Boolean))];
  return { topics: derived.length ? derived : ['Space', 'Science', 'AI & Tech'], custom: false };
}

/** Stories in the student's topics, newest first. Only stories with a source and URL are ever returned. */
export function selectStories(stories: Story[], topics: string[]) {
  const ok = stories.filter(s => s.source && /^https?:\/\//.test(s.url) && s.headline);
  const mine = ok.filter(s => topics.includes(s.topic)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const top = mine[0] || [...ok].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] || null;
  return { stories: mine, top, personal: !!mine[0], emptyTopics: topics.filter(t => !mine.some(s => s.topic === t)) };
}
