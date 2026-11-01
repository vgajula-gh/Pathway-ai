import type { Extracted } from '../discovery/extraction.js';
import type { Page } from '../discovery/pages.js';
const normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function factEvidence(raw:Extracted,pages:Page[],field:keyof Extracted){const e=raw.evidence[field];return e&&pages.some(p=>p.sourceUrl===e.sourceUrl&&normalized(p.text).includes(normalized(e.quote)))?e:null;}
export function isExplicitFree(quote:string){return !/not free|not included|exclud|application fee|registration fee|tuition|\$[1-9]/i.test(quote)&&/\b(free|no (?:participation |program |registration |application )?fees?|at no cost|no cost to participate)\b/i.test(quote);}
function dateInQuote(value:string,quote:string){const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value)return false;if(quote.includes(value))return true;const [year,month,day]=value.split('-').map(Number),names=['January','February','March','April','May','June','July','August','September','October','November','December'];return new RegExp(`(?:${names[month-1]}|${names[month-1]?.slice(0,3)})\\.?\\s+${day}(?:st|nd|rd|th)?[,]?\\s+${year}`,'i').test(quote)||new RegExp(`\\b${month}/${day}/${year}\\b`).test(quote);}
export function verifyOpportunity(raw:Extracted,pages:Page[],trustedDomains:Set<string>,now=new Date()){
 const evidence:Extracted['evidence']={};
 const value=<K extends keyof Extracted>(field:K):Extracted[K]|null=>{const v=raw[field],e=factEvidence(raw,pages,field);if(v==null||!e)return null;
  if(typeof v==='string'&&!['deadline','costType','officialUrl'].includes(field)&&!normalized(e.quote).includes(normalized(v)))return null;
  if(Array.isArray(v)&&!v.every(x=>normalized(e.quote).includes(normalized(x))))return null;
  if(typeof v==='number'){
   const gradeMatch=e.quote.match(/grades?\s+(\d{1,2})\s*(?:[-–—]|through|to)\s*(\d{1,2})/i);
   const single=e.quote.match(/grade\s+(\d{1,2})\b/i);
   if(field==='gradeMin'&&v!==Number(gradeMatch?.[1]||single?.[1]))return null;
   if(field==='gradeMax'&&v!==Number(gradeMatch?.[2]||single?.[1]))return null;
   if(field==='minAge'&&!new RegExp(`(?:age[d]?\\s*|at least\\s*)${v}\\b|\\b${v}\\s*(?:years? old|\\+)`,'i').test(e.quote))return null;
  }
  evidence[field]=e;return v;
 };
 const name=value('name'),organizer=value('organizer');if(!name||!organizer)throw new Error('Program name or organizer lacks page evidence');
 const domain=new URL(pages[0].sourceUrl).hostname.replace(/^www\./,'').toLowerCase();
 const trusted=[...trustedDomains].some(d=>domain===d||domain.endsWith('.'+d))||domain.endsWith('.gov')||domain.endsWith('.edu');
 const costEvidence=factEvidence(raw,pages,'costType');let costType='unknown';
 if(raw.costType==='free'&&costEvidence&&isExplicitFree(costEvidence.quote)){costType='free';evidence.costType=costEvidence;}
 if(raw.costType==='paid'&&costEvidence&&/fees?|tuition|dues|\$\s*\d|USD\s*\d/i.test(costEvidence.quote)){costType='paid';evidence.costType=costEvidence;}
 let deadline:string|null=null;const de=factEvidence(raw,pages,'deadline');if(raw.deadline&&de&&dateInQuote(raw.deadline,de.quote)){if(raw.deadline<now.toISOString().slice(0,10))throw new Error('Program deadline has passed');deadline=raw.deadline;evidence.deadline=de;}
 const gradeMin=value('gradeMin'),gradeMax=value('gradeMax');if(gradeMin!=null&&gradeMax!=null&&gradeMin>gradeMax)throw new Error('Invalid grade range');
 const costAmount=costType==='paid'?value('costAmount'):null;
 const amount=Number(costAmount?.match(/\$\s*([\d,]+)/)?.[1]?.replace(/,/g,''));
 const feeFlag=!trusted&&(costType==='unknown'||amount>=500);
 const format=value('format'),region=value('region');
 const verified=trusted&&gradeMin!=null&&gradeMax!=null&&costType!=='unknown'&&!!format&&!!deadline&&!feeFlag;
 return {name,organizer,url:pages[0].sourceUrl,officialDomain:domain,category:value('category')||'Program',gradeMin,gradeMax,minAge:value('minAge'),format:format||'Format not confirmed',region:JSON.stringify(region||[]),costType,costAmount,cost:costType==='free'?'Free':costType==='paid'?costAmount||'Participation fee — check official site':'Cost not confirmed — check the official site',costVerifiedAt:costType==='unknown'?null:now,financialAidNote:value('financialAidNote'),feeFlag,commitment:value('commitment')||'Time commitment not confirmed',skills:JSON.stringify(value('skills')||[]),tags:JSON.stringify(value('tags')||[]),checks:JSON.stringify([...(value('eligibilityNotes')?[value('eligibilityNotes')!]:[]),...(gradeMin==null||gradeMax==null?['Confirm grade eligibility on the official site']:[]),...(!region?.length&&!/virtual|online/i.test(format||'')?['Confirm the location on the official site']:[])]),deadline,requirements:JSON.stringify(value('requirements')||[]),evidence:JSON.stringify(evidence),verificationStatus:verified?'verified':'new_find',verifiedAt:verified?now:null,sourceCheckedAt:verified?now:null,isSample:false};
}
