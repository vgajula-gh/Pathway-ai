import { describe, it, expect } from 'vitest';
import { effectiveTopics, selectStories } from '../src/domain/news.js';

const stories = [
  { id: 'a', topic: 'Space', headline: 'A', summary: '', source: 'NASA', url: 'https://nasa.gov', publishedAt: '2026-10-08' },
  { id: 'b', topic: 'AI & Tech', headline: 'B', summary: '', source: 'MIT', url: 'https://mit.edu', publishedAt: '2026-10-09' },
  { id: 'c', topic: 'AI & Tech', headline: 'C', summary: '', source: '', url: 'https://x.y', publishedAt: '2026-10-10' }
];
describe('news for you', () => {
  it('derives topics from interests, and respects the student\u2019s own choice', () => {
    expect(effectiveTopics(['AI', 'Coding']).topics).toEqual(['AI & Tech']);
    expect(effectiveTopics(['AI'], ['Space'])).toEqual({ topics: ['Space'], custom: true });
    expect(effectiveTopics([]).topics.length).toBe(3);
  });
  it('never returns a story without a source, and sorts newest first', () => {
    const r = selectStories(stories, ['AI & Tech', 'Space']);
    expect(r.stories.map(s => s.id)).toEqual(['b', 'a']);
    expect(r.top?.id).toBe('b');
  });
  it('reports topics with no stories instead of filling them', () => {
    expect(selectStories(stories, ['Sports', 'Space']).emptyTopics).toEqual(['Sports']);
  });
});
