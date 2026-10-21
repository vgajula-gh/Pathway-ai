import type { NewsTopic } from '../data/news.js';

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  hosts: readonly string[];
  topic: NewsTopic;
  policyUrl: string;
}

// Candidate sources: enable only after deployment-time terms and live-feed checks.
// Exact hosts prevent feed-supplied URLs from turning this job into an arbitrary fetcher.
export const NEWS_SOURCES: readonly NewsSource[] = [
  { id: 'nasa', name: 'NASA', feedUrl: 'https://www.nasa.gov/feed/',
    hosts: ['www.nasa.gov', 'science.nasa.gov'], topic: 'Space', policyUrl: 'https://www.nasa.gov/rss-feeds/' },
  { id: 'nsf', name: 'U.S. National Science Foundation', feedUrl: 'https://www.nsf.gov/rss/rss_www_news.xml',
    hosts: ['www.nsf.gov', 'nsf.gov'], topic: 'Science', policyUrl: 'https://www.nsf.gov/rss' },
];

export function configuredSources(value: string | undefined): NewsSource[] {
  const ids = [...new Set((value || '').split(',').map(x => x.trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Set NEWS_SOURCE_IDS after validating source terms and feed availability (nasa,nsf).');
  return ids.map(id => {
    const source = NEWS_SOURCES.find(s => s.id === id);
    if (!source) throw new Error(`Unknown news source: ${id}`);
    return source;
  });
}
