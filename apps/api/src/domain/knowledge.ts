import { Passage } from '../knowledge/contracts.js';
export function chunkText(text: string, size = 500, overlap = 50) {
  if (size <= overlap || overlap < 0) throw new Error('Invalid chunk overlap');
  const words = text.trim().split(/\s+/).filter(Boolean),
    chunks: string[] = [];
  for (let start = 0; start < words.length; start += size - overlap) {
    chunks.push(words.slice(start, start + size).join(' '));
    if (start + size >= words.length) break;
  }
  return chunks;
}
export function keywordScore(text: string, query: string) {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])];
  return words.length ? words.filter((w) => text.toLowerCase().includes(w)).length / words.length : 0;
}
export function supportedClaims(raw: unknown, passages: Passage[]) {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { claims?: unknown }).claims)) return [];
  return (raw as { claims: unknown[] }).claims.slice(0, 5).flatMap((c) => {
    if (!c || typeof c !== 'object') return [];
    const claim = c as { chunkId?: unknown; quote?: unknown };
    const p = passages.find((p) => p.id === claim.chunkId);
    return p &&
      typeof claim.quote === 'string' &&
      claim.quote.length >= 10 &&
      claim.quote.length <= 600 &&
      p.text.includes(claim.quote)
      ? [{ quote: claim.quote, passage: p }]
      : [];
  });
}
