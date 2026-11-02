import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import { pinnedLookup, publicAddress } from '../lib/calendar-fetch.js';
import { CAPS, RunBudget } from './config.js';
export type Page = {
  sourceUrl: string;
  pageTitle: string;
  text: string;
  contentHash: string;
  checkedAt: Date;
  links: string[];
};
const agent = 'PathwayOpportunityBot';
export function officialUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443'))
    throw new Error('Only public HTTPS pages are supported');
  u.hash = '';
  return u;
}
async function raw(
  value: string,
  budget: RunBudget,
  redirects = 0,
): Promise<{ url: string; body: string; status: number }> {
  const url = officialUrl(value);
  budget.take('pages');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = ipaddr.isValid(host)
    ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error('Private network pages are not supported');
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        agent: false,
        lookup: pinnedLookup(addresses[0].address, addresses[0].family),
        headers: { 'user-agent': agent, accept: 'text/html,text/plain' },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
          res.resume();
          if (redirects >= 3) return reject(new Error('Too many redirects'));
          const next = new URL(res.headers.location, url);
          if (next.origin !== url.origin)
            return reject(new Error('Cross-domain redirects require a new official source'));
          raw(next.href, budget, redirects + 1).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 1024 * 1024) req.destroy(new Error('Page too large'));
          else chunks.push(c);
        });
        res.on('end', () =>
          resolve({
            url: url.href,
            body: Buffer.concat(chunks).toString('utf8'),
            status: res.statusCode || 0,
          }),
        );
        res.on('error', reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Page timed out')), 15000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}
export function readable(html: string, url: string): Omit<Page, 'checkedAt'> {
  const $ = load(html);
  $('script,style,noscript,nav,footer,header,form,iframe').remove();
  const text = ($('main').text() || $('article').text() || $('body').text())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CAPS.pageChars);
  const links = $('a[href]')
    .toArray()
    .flatMap((a) => {
      try {
        const u = officialUrl(new URL($(a).attr('href')!, url).href);
        return u.origin === new URL(url).origin &&
          /rules|faq|eligib|fee|cost|apply|requirements/i.test(u.pathname)
          ? [u.href]
          : [];
      } catch {
        return [];
      }
    });
  return {
    sourceUrl: url,
    pageTitle: $('title').text().trim().slice(0, 200) || new URL(url).hostname,
    text,
    contentHash: createHash('sha256').update(text).digest('hex'),
    links: [...new Set(links)].slice(0, 3),
  };
}
export async function fetchOfficialPage(value: string, budget: RunBudget): Promise<Page> {
  const url = officialUrl(value),
    robotUrl = new URL('/robots.txt', url).href;
  const rules = await raw(robotUrl, budget);
  if (rules.status !== 404 && (rules.status !== 200 || rules.body.length > 100000))
    throw new Error('Could not check site crawling rules');
  if (rules.status === 200 && robotsParser(robotUrl, rules.body).isAllowed(url.href, agent) === false)
    throw new Error('Site does not allow this page to be fetched');
  const page = await raw(url.href, budget);
  if (page.status !== 200) throw new Error('Official page unavailable');
  const data = readable(page.body, page.url);
  if (data.text.length < 80) throw new Error('Official page has too little readable text');
  return { ...data, checkedAt: new Date() };
}
