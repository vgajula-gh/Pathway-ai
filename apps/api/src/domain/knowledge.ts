import { Passage } from '../knowledge/contracts.js';
/** Pinecone text queries contain only fixed public topics, never user wording,
 * profile details or chat history. Original wording is used for local reranking. */
export function publicProgramQuery(query:string) {
  const topics:[RegExp,string][]=[
    [/\b(requir\w*|recommend\w*|checklists?|documents?|essays?|transcripts?|submit\w*|apply|application\w*)\b/i,'application requirements recommendation documents submission'],
    [/\b(cost\w*|prices?|fees?|pay\w*|paid|free|aid|scholarship\w*|afford\w*|fund\w*)\b/i,'participation fees cost financial aid scholarships'],
    [/\b(deadlines?|dates?|when|open\w*|close\w*|due|start\w*|end\w*|schedules?|times?|duration)\b/i,'application deadline opening dates program schedule duration'],
    [/\b(eligib\w*|grades?|ages?|school|qualif\w*|citizen\w*|residen\w*|countr\w*|international|visas?)\b/i,'eligibility school grades age residency requirements'],
    [/\b(where|locations?|online|virtual|remote|in[- ]person|travel\w*|transport\w*|housing|meals?|lunch|food)\b/i,'program location format travel housing meals'],
    [/\b(accessib\w*|accommodat\w*|disabil\w*)\b/i,'program accessibility accommodations'],
    [/\b(teams?|partners?|groups?|individual)\b/i,'individual participation team requirements'],
    [/\b(learn\w*|skills?|projects?|topics?|subjects?|curricul\w*|coding|science|business|engineer\w*)\b/i,'program curriculum skills projects activities'],
    [/\b(contacts?|emails?|phones?|help|support)\b/i,'program organizer contact support'],
    [/\b(awards?|prizes?|benefits?|certificates?|credits?)\b/i,'program awards benefits certificates'],
    [/\b(parents?|guardians?|permissions?|consent)\b/i,'parent guardian permission requirements'],
  ];
  const selected=topics.filter(([pattern])=>pattern.test(query.slice(0,1000))).map(([,topic])=>topic);
  return selected.length?selected.join('; '):'program overview application requirements eligibility cost dates';
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
