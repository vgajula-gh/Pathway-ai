import { openaiSearch } from '../../agent/llm/search-openai.js';
import { anthropicSearch } from '../../agent/llm/search-anthropic.js';
export interface SearchResult {
  urls: string[];
  tokens: number;
}
export interface SearchProvider {
  search(query: string): Promise<SearchResult>;
}
export function getSearch(): SearchProvider | null {
  return process.env.SEARCH_PROVIDER === 'openai' && process.env.OPENAI_API_KEY
    ? openaiSearch()
    : process.env.SEARCH_PROVIDER === 'anthropic' && process.env.ANTHROPIC_API_KEY
      ? anthropicSearch()
      : null;
}
