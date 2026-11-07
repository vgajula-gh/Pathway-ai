import { httpsSourceURL } from '../discovery/source-urls.js';

/** A search/map listing identifies a lead, not the program's source website. */
export function programSourceURL(value: string): URL | null {
  let url = httpsSourceURL(value);
  if (!url) return null;
  const google = /(^|\.)google\.[a-z.]+$/i.test(url.hostname);
  // Resolve only explicit provider-returned redirect targets; never guess a website.
  if (google && url.pathname === '/url') {
    const target = url.searchParams.get('url') || url.searchParams.get('q');
    url = target ? httpsSourceURL(target) : null;
    if (!url) return null;
  }
  const host = url.hostname.toLowerCase(), path = url.pathname.toLowerCase();
  if ((/(^|\.)google\.[a-z.]+$/.test(host) && (/^\/(maps|search|url)(\/|$)/.test(path) || host.startsWith('maps.'))) ||
      (/(^|\.)bing\.com$/.test(host) && /^\/(maps|search)(\/|$)/.test(path)) ||
      /(^|\.)(duckduckgo\.com|search\.yahoo\.com|maps\.apple\.com)$/.test(host)) return null;
  return url;
}

export const isProgramSource = (value: string) => !!programSourceURL(value);
export const genericLeadName = (value: string) => /^Search result:/i.test(value);
