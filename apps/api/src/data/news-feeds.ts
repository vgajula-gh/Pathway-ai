import type {NewsTopic} from './news.js';
export interface NewsFeed {id:string;topic:NewsTopic;source:string;url:string;articleDomains:string[]}
/** Fixed public publisher endpoints; student data is never sent to a feed. */
export const NEWS_FEEDS:NewsFeed[]=[
  {id:'nasa',topic:'Space',source:'NASA',url:'https://www.nasa.gov/feed/',articleDomains:['nasa.gov']},
  {id:'bbc-science',topic:'Science',source:'BBC News',url:'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',articleDomains:['bbc.co.uk','bbc.com']},
  {id:'bbc-technology',topic:'AI & Tech',source:'BBC News',url:'https://feeds.bbci.co.uk/news/technology/rss.xml',articleDomains:['bbc.co.uk','bbc.com']},
  {id:'bbc-health',topic:'Health & Medicine',source:'BBC News',url:'https://feeds.bbci.co.uk/news/health/rss.xml',articleDomains:['bbc.co.uk','bbc.com']},
  {id:'sciencedaily-climate',topic:'Climate & Nature',source:'ScienceDaily',url:'https://www.sciencedaily.com/rss/earth_climate.xml',articleDomains:['sciencedaily.com']},
  {id:'bbc-arts',topic:'Arts & Culture',source:'BBC News',url:'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',articleDomains:['bbc.co.uk','bbc.com']},
  {id:'bbc-sport',topic:'Sports',source:'BBC Sport',url:'https://feeds.bbci.co.uk/sport/rss.xml',articleDomains:['bbc.co.uk','bbc.com']}
];
