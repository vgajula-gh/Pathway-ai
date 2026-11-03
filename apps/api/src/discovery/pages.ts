import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import { pinnedLookup, publicAddress } from '../lib/calendar-fetch.js';
import { CAPS, RunBudget } from './config.js';
import { DiscoveryFailure, FailureStage } from './failures.js';
import {httpsSourceURL,fileSourceType,sourceType} from './source-urls.js';
export type Page = {
  sourceUrl: string; pageTitle: string; text: string; contentHash: string; checkedAt: Date; links: string[];
};
const agent = 'PathwayOpportunityBot';
const maxBytes = 1024 * 1024;
export function officialUrl(value: string) {
  const u=httpsSourceURL(value);
  if(!u)throw new DiscoveryFailure({stage:'fetch',code:'invalid_url'});
  return u;
}
/** Only the canonical www/apex form of the same hostname may change origin. */
export const canonicalRedirect = (from: URL, to: URL) =>
  from.hostname.replace(/^www\./, '') === to.hostname.replace(/^www\./, '');
/** Cross-domain applications need explicit owner review, not a .org suffix. */
export const reviewedRedirect=(to:URL)=>[...(process.env.DISCOVERY_TRUSTED_DOMAINS||'').split(','),...(process.env.SCOUT_REDIRECT_DOMAINS||'').split(',')]
  .map(s=>s.trim().toLowerCase()).filter(Boolean).some(domain=>to.hostname===domain||to.hostname.endsWith('.'+domain));

async function addressesFor(url: URL, stage: FailureStage, budget: RunBudget) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = ipaddr.isValid(host)
      ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }]
      : await Promise.race([
          lookup(host, { all: true }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('dns timeout')), Math.min(5000, Math.max(1, budget.deadlineAt - Date.now()))); }),
        ]);
    if (!addresses.length || addresses.some(a => !publicAddress(a.address)))
      throw new DiscoveryFailure({ stage, code: 'private_address' });
    // Pin every connection, preferring IPv4 on hosts without working IPv6 egress.
    const first = addresses.find(a => a.family === 4) || addresses[0];
    const other = addresses.find(a => a.family !== first.family) || addresses.find(a => a.address !== first.address);
    return other ? [first, other] : [first];
  } catch (error) {
    if (error instanceof DiscoveryFailure) throw error;
    throw new DiscoveryFailure({ stage, code: 'dns_failed', sourceHost: url.hostname });
  } finally { if (timer) clearTimeout(timer); }
}

function request(url: URL, address: { address: string; family: number }, budget: RunBudget, stage: FailureStage): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: Buffer }> {
  budget.take('pages');
  return new Promise((resolve, reject) => {
    const req = get(url, {
      agent: false, lookup: pinnedLookup(address.address, address.family),
      headers: { 'user-agent': agent+'/1.0 (+https://github.com/vgajula-gh/Pathway-ai)', accept: 'text/html,application/xhtml+xml,text/plain', 'accept-encoding': 'gzip, br, deflate' },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        res.resume(); resolve({ status: res.statusCode!, headers: res.headers, bytes: Buffer.alloc(0) }); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) req.destroy(new DiscoveryFailure({ stage, code: 'page_too_large', sourceHost: url.hostname }));
        else chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, bytes: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new DiscoveryFailure({ stage, code: 'timeout', sourceHost: url.hostname })), Math.min(15000, Math.max(1, budget.deadlineAt - Date.now())));
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}

function decode(bytes: Buffer, encoding: string | undefined, stage: FailureStage, sourceHost: string) {
  const kind=encoding?.trim().toLowerCase()||'identity';
  const contentEncoding=['gzip','br','deflate','identity'].includes(kind)?kind as 'gzip'|'br'|'deflate'|'identity':'other';
  if(contentEncoding==='other')throw new DiscoveryFailure({stage,code:'content_decoding_failed',sourceHost,contentEncoding});
  try {
    const options = { maxOutputLength: maxBytes };
    const body = kind === 'gzip' ? gunzipSync(bytes, options)
      : kind === 'br' ? brotliDecompressSync(bytes, options)
      : kind === 'deflate' ? inflateSync(bytes, options) : bytes;
    return body.toString('utf8');
  } catch(error) {
    const code=(error as {code?:string}).code==='ERR_BUFFER_TOO_LARGE'?'page_too_large':'content_decoding_failed';
    throw new DiscoveryFailure({stage,code,sourceHost,contentEncoding});
  }
}

async function raw(value: string, budget: RunBudget, stage: 'robots' | 'fetch', redirects = 0): Promise<{ url: string; body: string; status: number; contentType: string }> {
  const url = officialUrl(value);
  budget.check();
  if (stage === 'fetch') await allowed(url, budget);
  const addresses = await addressesFor(url, stage, budget);
  let response: Awaited<ReturnType<typeof request>> | undefined;
  for (let i = 0; i < addresses.length; i++) {
    try { response = await request(url, addresses[i], budget, stage); break; }
    catch (error) {
      if (error instanceof DiscoveryFailure && error.info.code !== 'timeout') throw error;
      const code = (error as { code?: string }).code;
      const transport = error instanceof DiscoveryFailure || ['ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code || '');
      if (transport && i + 1 < addresses.length) continue;
      if (error instanceof DiscoveryFailure) throw error;
      throw new DiscoveryFailure({ stage, code: 'connection_failed', sourceHost: url.hostname });
    }
  }
  if (!response) throw new DiscoveryFailure({ stage, code: 'connection_failed', sourceHost: url.hostname });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 3) throw new DiscoveryFailure({ stage, code: 'redirect_limit', sourceHost: url.hostname });
    if (!response.headers.location) throw new DiscoveryFailure({ stage, code: 'http_error', sourceHost: url.hostname, httpStatus: response.status });
    const next = officialUrl(new URL(response.headers.location, url).href);
    if (next.origin !== url.origin && !canonicalRedirect(url, next)&&!reviewedRedirect(next))
      throw new DiscoveryFailure({ stage, code: 'redirect_requires_review', sourceHost: url.hostname });
    // Each hop repeats DNS validation/pinning and checks the destination's robots rules.
    return raw(next.href, budget, stage, redirects + 1);
  }
  return { url: url.href, status: response.status, contentType: response.headers['content-type'] || '', body: decode(response.bytes, response.headers['content-encoding'], stage, url.hostname) };
}

async function allowed(url: URL, budget: RunBudget) {
  const robotUrl = new URL('/robots.txt', url).href;
  let pending = budget.robots.get(url.origin);
  if (!pending) { pending = raw(robotUrl, budget, 'robots'); budget.robots.set(url.origin, pending); }
  const rules = await pending;
  if (rules.status !== 404 && (rules.status !== 200 || rules.body.length > 100000))
    throw new DiscoveryFailure({ stage: 'robots', code: 'robots_unavailable', sourceHost: url.hostname, httpStatus: rules.status });
  // A canonical robots redirect applies to the same path on its final hostname.
  const checkedUrl = new URL(url.pathname + url.search, rules.url);
  if (rules.status === 200 && robotsParser(rules.url, rules.body).isAllowed(checkedUrl.href, agent) === false)
    throw new DiscoveryFailure({ stage: 'robots', code: 'robots_blocked', sourceHost: url.hostname });
}

export function readable(html: string, url: string): Omit<Page, 'checkedAt'> {
  const $ = load(html);
  // Eligibility/fee links often live in navigation, even though navigation is not source text.
  const links = $('a[href]').toArray().flatMap(a => {
    try {
      const u = officialUrl(new URL($(a).attr('href')!, url).href);
      return u.origin === new URL(url).origin && !fileSourceType(u) && /rules|faq|eligib|fee|cost|apply|requirements/i.test(u.pathname) ? [u.href] : [];
    } catch { return []; }
  });
  const title=$('title').text().replace(/\s+/g,' ').trim().slice(0,200);
  $('script,style,noscript,nav,footer,header,form,iframe').remove();
  $('br,hr').replaceWith(' ');
  $('main,article,section,div,p,h1,h2,h3,h4,h5,h6,li,ul,ol,table,tr,td,th,dl,dt,dd,blockquote').each((_i,el)=>{$(el).prepend(' ').append(' ');});
  const body=($('main').text() || $('article').text() || $('body').text()).replace(/\s+/g,' ').trim();
  const text=(title?title+' '+body:body).trim().slice(0,CAPS.pageChars);
  return { sourceUrl: url, pageTitle: title || new URL(url).hostname, text, contentHash: createHash('sha256').update(text).digest('hex'), links: [...new Set(links)].slice(0, 3) };
}
export async function fetchOfficialPage(value: string, budget: RunBudget): Promise<Page> {
  const page = await raw(officialUrl(value).href, budget, 'fetch');
  const sourceHost = new URL(page.url).hostname;
  if (page.status !== 200) throw new DiscoveryFailure({ stage: 'fetch', code: 'http_error', sourceHost, httpStatus: page.status });
  const type=page.contentType.split(';')[0].trim().toLowerCase(),prefix=page.body.slice(0,2048).replace(/^\uFEFF/,'').trimStart();
  const binary=prefix.startsWith('%PDF-')||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(prefix.slice(0,256));
  const start=prefix.replace(/^(?:\s*<!--[\s\S]*?-->\s*|\s*<\?xml[^>]*\?>\s*)*/i,'');
  const html=/^(?:<!doctype\s+html\b|<(?:html|head|body|main|article)\b)/i.test(start);
  const declared=['text/html','text/plain','application/xhtml+xml'].includes(type);
  const generic=['','application/octet-stream','binary/octet-stream','application/unknown'].includes(type);
  if(binary||!declared&&!(generic&&html))
    throw new DiscoveryFailure({stage:'fetch',code:'unsupported_content',sourceHost,mediaType:prefix.startsWith('%PDF-')?'application/pdf':sourceType(type)});
  const data = readable(page.body, page.url);
  if (data.text.length < 80) throw new DiscoveryFailure({ stage: 'fetch', code: 'insufficient_text', sourceHost });
  return { ...data, checkedAt: new Date() };
}
