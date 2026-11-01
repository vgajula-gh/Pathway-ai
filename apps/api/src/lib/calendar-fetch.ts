import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';

export function publicCalendarUrl(value: string) {
  const url = new URL(value.replace(/^webcal:/i, 'https:'));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Use a private HTTPS iCalendar link');
  return url;
}
export function publicAddress(address: string) {
  let ip = ipaddr.parse(address);
  if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address();
  return ip.range() === 'unicast';
}
export function pinnedLookup(address: string, family: number): LookupFunction {
  // Modern Node may request all addresses for auto-family selection. Preserve
  // that callback shape while still returning only the validated pinned address.
  return (_host, options, cb) => cb(null, options.all ? [{ address, family }] : address, family);
}
/** Validate every redirect and pin DNS to a public address to prevent rebinding. */
export async function fetchCalendar(value: string, redirects = 0): Promise<string> {
  const url = publicCalendarUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = ipaddr.isValid(host) ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Private network links are not supported');
  const { address, family } = addresses[0];
  return new Promise((resolve, reject) => {
    const req = get(url, { agent: false, lookup: pinnedLookup(address, family), headers: { accept: 'text/calendar' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
        res.resume(); if (redirects >= 3) { reject(new Error('Too many redirects')); return; }
        fetchCalendar(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject); return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('Calendar not available')); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) { req.destroy(new Error('Calendar too large')); return; } chunks.push(chunk); });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); res.on('error', reject);
    });
    req.setTimeout(15000, () => req.destroy(new Error('Calendar timed out'))); req.on('error', reject);
  });
}
