import type {Page} from '../discovery/pages.js';
import {resolveEvidence,sourcePassages} from '../scout/passages.js';
import type {ScoutFacts} from '../scout/schema.js';
import type {storeCandidate} from '../discovery/pipeline.js';
import {gradeRangeInQuote} from './opportunity-evidence.js';
import {explicitApplicationStatus,opportunityKind} from './opportunity-active.js';
import {PROMPT_VERSION} from '../scout/prompts.js';
import {normalizedRegion} from './regions.js';
export type QualificationReason={field:string;reason:string};
export type CandidateData=Parameters<typeof storeCandidate>[0]&{scoutFacts?:string;qualificationNotes?:string;promptVersion?:string;sourceReadAt?:Date|null};
export type Qualification={disposition:'verified'|'needs_verification'|'watchlist'|'excluded';reasons:QualificationReason[];data?:CandidateData};

export const normalizeEvidence=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();
function literal(value:string,quote:string) {
  const text=normalizeEvidence(quote),needle=normalizeEvidence(value);if(!needle)return false;
  let from=0,index:number;
  while((index=text.indexOf(needle,from))>=0) {
    const before=text[index-1]||' ',after=text[index+needle.length]||' ';
    if((!/[\p{L}\p{N}]/u.test(needle[0])||!/[\p{L}\p{N}]/u.test(before))&&(!/[\p{L}\p{N}]/u.test(needle.at(-1)!)||!/[\p{L}\p{N}]/u.test(after)))return true;
    from=index+1;
  }
  return false;
}
export function confirmedDate(value:string|null,quote:string,kind:'deadline'|'opening'|'activity'|'date'='date') {
  if(!value)return null;
  const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value)return null;
  const [year,month,day]=value.split('-').map(Number),names=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const patterns=[value,`(?:${names[month-1]}|${names[month-1].slice(0,3)})\\.?\\s+0?${day}(?:st|nd|rd|th)?[,]?\\s+${year}`,`0?${day}(?:st|nd|rd|th)?\\s+(?:${names[month-1]}|${names[month-1].slice(0,3)})\\.?[,]?\\s+${year}`,`0?${month}/0?${day}/${year}`];
  for(const pattern of patterns)for(const m of quote.matchAll(new RegExp(`\\b(?:${pattern})\\b`,'gi'))) {
    const around=quote.slice(Math.max(0,m.index!-100),m.index!+m[0].length+50);
    if(kind==='date'||(kind==='deadline'?/deadline|apply by|applications? (?:are )?due|submissions? (?:are )?due|entries (?:are )?due|registration (?:closes|ends)|submit by/i:kind==='opening'?/applications? open|registration opens|opening|opens (?:on|for)/i:/activity|meeting|volunteer|session|event|club/i).test(around))return value;
  }
  return null;
}
const money=(quote:string)=>[...quote.matchAll(/(?:\$\s*|USD\s*)([\d,]+(?:\.\d{1,2})?)/gi)].map(m=>Number(m[1].replace(/,/g,'')));
function positiveRequiredCost(quote:string) {
  for(const m of quote.matchAll(/(?:\$\s*|USD\s*)([\d,]+(?:\.\d{1,2})?)/gi)) {
    if(Number(m[1].replace(/,/g,''))<=0)continue;
    const end=m.index!+m[0].length,stop=quote.slice(end).search(/[.!?;]/);
    const around=quote.slice(Math.max(0,quote.lastIndexOf('.',m.index!)+1,m.index!-100),stop<0?end+80:end+stop);
    if(!/optional|not required/i.test(around)&&/required|mandatory|tuition|fees?|dues|costs?|charge|purchase|materials|housing/i.test(around))return true;
  }
  return false;
}
export function freeParticipation(quote:string) {
  const q=normalizeEvidence(quote);
  const unpricedCharge=q.split(/[.!?;]/).some(s=>/\b(?:fees?|charges?|costs?|purchase)\b/.test(s)&&/\b(?:apply|required|mandatory|not included|extra)\b/.test(s)&&!/\b(?:no|without|zero|optional|waived)\b/.test(s)&&money(s).length===0);
  if(/not free|free trial/i.test(q)||positiveRequiredCost(q)||unpricedCharge)return false;
  return /\b(?:participation|program|course|camp|workshop|event|competition|tuition)\b[^.!?]{0,60}\b(?:free|no fees?|no cost|no charge)\b|\b(?:free|no-cost)\s+(?:participation|program|course|camp|workshop|event|competition)\b|\bno\s+(?:tuition|participation|program|registration)\s*(?:or\s+(?:tuition|participation|program|registration)\s*)?fees?\b|^\s*(?:free|no fees?|no cost to participate)[.!]?\s*$/i.test(q);
}

/** Model facts are assertions. Only selected literal passages establish public program facts. */
export function qualifyScout(facts:ScoutFacts,pages:Page[],trusted:Set<string>,now=new Date(),lead?:{name:string|null;url:string}):Qualification {
  const reasons:QualificationReason[]=[],notes:string[]=[],add=(field:string,reason:string)=>{if(!reasons.some(r=>r.field===field&&r.reason===reason))reasons.push({field,reason});};
  if(!pages.length||pages.some(p=>!Number.isFinite(+new Date(p.checkedAt))))return {disposition:'excluded',reasons:[{field:'source',reason:'unverifiable'}]};
  const resolved=resolveEvidence(facts,sourcePassages(pages));
  const evidence:Record<string,{sourceUrl:string;quote:string}>={};
  const quote=(field:keyof ScoutFacts)=>resolved[field]?.quote||'';
  const keep=(field:keyof ScoutFacts)=>{if(resolved[field])evidence[field]=resolved[field];};
  const text=(field:keyof ScoutFacts):string|null=>{const value=facts[field];if(typeof value==='string'&&value&&literal(value,quote(field))){keep(field);return value;}return null;};
  const list=(field:'skills'|'tags'|'requirements')=>{const values=facts[field]?.filter(v=>literal(v,quote(field)))||[];if(values.length)keep(field);return values;};
  const evidencedName=text('name'),name=evidencedName||lead?.name||pages[0].pageTitle||facts.name,organizer=text('organizer');
  if(!evidencedName){add('name','not_stated');notes.push('Program name comes from the search result; details are not confirmed');}
  if(!name)add('name',facts.name?'value_not_supported':'not_stated');
  if(!organizer)notes.push('Organizer not confirmed');
  const domain=new URL(pages[0].sourceUrl).hostname.replace(/^www\./,'').toLowerCase();
  const sourceUrl=new URL(pages[0].sourceUrl);
  const listing=/^(?:google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(domain)||/^\/(?:search|tag)(?:\/|$)/i.test(sourceUrl.pathname)||/\b(?:top\s+\d+|\d+\s+best|best\s+\d+|search results)\b/i.test(pages[0].pageTitle);
  if(listing)add('source','low_quality_source');
  const reviewed=[...trusted].some(d=>domain===d||domain.endsWith('.'+d))||domain.endsWith('.edu')||domain.endsWith('.gov');
  if(!reviewed){add('officialDomain','unreviewed_domain');notes.push('Source needs owner review');}

  const ranges=['gradeMin','gradeMax'].flatMap(field=>{const r=gradeRangeInQuote(quote(field as 'gradeMin'));return r?[r]:[];});
  const gradeConflict=ranges.some(r=>r.min!==ranges[0].min||r.max!==ranges[0].max);
  const grades=!gradeConflict?ranges[0]:null;
  let gradeMin=grades?.min??null,gradeMax=grades?.max??null;
  if(grades){keep('gradeMin');keep('gradeMax');}
  const hs=facts.schoolLevel==='high_school'&&/\bhigh[ -]school\b/i.test(quote('schoolLevel'))&&!/not (?:open|available|eligible).{0,30}high[ -]school|high[ -]school.{0,30}not eligible/i.test(quote('schoolLevel'));
  if(hs)keep('schoolLevel');
  const restrictedSchoolYear=!grades&&/\b(?:rising|entering|seniors? only|juniors? only|only (?:high[ -]school )?(?:seniors?|juniors?|sophomores?|freshmen))\b/i.test(quote('schoolLevel')+' '+quote('gradeMin')+' '+quote('gradeMax'));
  if(restrictedSchoolYear){add('gradeRange','not_stated');notes.push('Check the specific school-year requirement on the program page');}
  const collegeOnly=/\b(?:college|undergraduate|graduate|adult)[ -]only\b|\b(?:only|exclusively) (?:for|to) (?:college|undergraduate|graduate|adult)\b/i.test(pages[0].text);
  if(collegeOnly)add('schoolLevel','not_eligible');
  if(collegeOnly)notes.push('The page lists college/adult-only eligibility; check whether you can apply');
  if(gradeConflict){gradeMin=null;gradeMax=null;add('gradeRange','value_not_supported');}
  if(!grades&&!hs){add('gradeMin','not_stated');notes.push('Check grade eligibility');}
  let minAge:number|null=null;
  if(facts.minAge!=null&&new RegExp(`(?:age[d]?\\s*|at least\\s*)${facts.minAge}\\b|\\b${facts.minAge}\\s*(?:years? old|\\+)`,'i').test(quote('minAge'))) {minAge=facts.minAge;keep('minAge');notes.push(`Confirm minimum age ${minAge}; age is not inferred from grade`);}

  const fq=quote('format');
  const online=/\b(?:online|virtual|remote)\b(?!\s+(?:applications?|registration|forms?|portals?|payments?))/i.test(fq),inPerson=/\bin[ -]person\b|\bon[ -]campus\b|\bon[ -]site\b/i.test(fq);
  const format=online&&inPerson?'Hybrid':online?'Online':inPerson?'In person':'Format not confirmed';
  if(online||inPerson)keep('format');else notes.push('Check participation format');
  const region=(facts.region||[]).filter(r=>(literal(r,quote('region'))||r==='US'&&/\bUnited States\b|\bU\.S\./i.test(quote('region')))&&/residen|eligib|citizen|must live|students from/i.test(quote('region'))).map(normalizedRegion);if(region.length)keep('region');
  const city=text('city'),state=text('state'),eligibilityNotes=text('eligibilityNotes');
  if(eligibilityNotes)notes.push(eligibilityNotes);

  const category=text('category')||'Program',opportunityType=opportunityKind(category,name||'');
  const deadline=confirmedDate(facts.deadline,quote('deadline'),'deadline');if(deadline)keep('deadline');
  const openingDate=confirmedDate(facts.openingDate,quote('openingDate'),'opening');if(openingDate)keep('openingDate');
  const activityDate=confirmedDate(facts.activityDate,quote('activityDate'),'activity');if(activityDate)keep('activityDate');
  const statusQuote=quote('applicationStatus');
  const applicationStatus=['open','rolling','closed'].includes(facts.applicationStatus)&&explicitApplicationStatus(facts.applicationStatus,statusQuote)?facts.applicationStatus:'unknown';
  if(applicationStatus!=='unknown')keep('applicationStatus');
  const today=now.toISOString().slice(0,10);
  if(deadline&&deadline<today)add('deadline','past_deadline');
  if(applicationStatus==='closed')add('applicationStatus','closed');
  if(applicationStatus==='closed')notes.push('Applications are reported closed; confirm the current cycle');
  const active=applicationStatus!=='closed'&&(!openingDate||openingDate<=today)&&(!deadline||deadline>=today)&&(opportunityType==='competition'?!!deadline&&deadline>today:
    ['club','volunteering'].includes(opportunityType)?['open','rolling'].includes(applicationStatus)||!!activityDate&&activityDate>=today:
      !!deadline&&deadline>today||['open','rolling'].includes(applicationStatus));
  const upcoming=!active&&!!openingDate&&openingDate>today&&applicationStatus!=='closed';
  if(!active&&!upcoming){add(opportunityType==='competition'?'deadline':'applicationStatus',opportunityType==='competition'?'no_confirmed_deadline':'not_current');}

  const costQuote=quote('costType'),positive=positiveRequiredCost(costQuote),extra=text('additionalCosts');
  const requiredExtra=!!extra&&/required|mandatory|unavoidable/i.test(extra);
  let costType='unknown';
  if(freeParticipation(costQuote)&&!requiredExtra)costType='free';
  else if(positive||facts.costType==='paid'&&/fees?|tuition|dues|required purchase/i.test(costQuote))costType='paid';
  if(facts.costType==='tuition_free_other_costs'&&/tuition[ -]free|no tuition|tuition.{0,20}free/i.test(costQuote)&&(positive||requiredExtra))costType='tuition_free_other_costs';
  if(costType!=='unknown')keep('costType');
  const costAmount=costType!=='free'&&costType!=='unknown'?text('costAmount'):null;
  const prices=money(quote('costMin')+' '+quote('costMax'));
  const currency=facts.currency==='USD'&&/\bUSD\b|U\.?S\.? dollars?/i.test(quote('currency'))?'USD':null;if(currency)keep('currency');
  const amount=(field:'costMin'|'costMax')=>{const value=facts[field];if(value!=null&&prices.includes(value)&&new Set(prices).size<=2){keep(field);return value;}return null;};
  let costMin=amount('costMin'),costMax=amount('costMax');
  if(costMin!=null&&costMax!=null&&costMin>costMax){costMin=null;costMax=null;}
  const financialAidNote=text('financialAidNote'),commitment=text('commitment');
  const hours=(field:'hoursMin'|'hoursMax')=>{const value=facts[field];if(value!=null&&new RegExp(`\\b${value}\\s*(?:hours?|hrs?)\\b`,'i').test(quote(field))&&/per week|weekly|hours?\/week/i.test(quote(field))){keep(field);return value;}return null;};
  const hoursMin=hours('hoursMin'),hoursMax=hours('hoursMax');
  const parentConsent=facts.parentConsent===true&&/\b(?:parent|guardian|parental)\b.{0,60}\b(?:consent|permission|signature)\b.{0,30}\b(?:required|must)\b|\b(?:required|must)\b.{0,60}\b(?:parent|guardian|parental)\b.{0,30}\b(?:consent|permission|signature)\b/i.test(quote('parentConsent'));
  if(parentConsent)keep('parentConsent');
  const projectBased=facts.projectBased===true&&/build|creat|project|prototype|present|design/i.test(quote('projectBased'));if(projectBased)keep('projectBased');
  const tags=list('tags'),skills=list('skills'),requirements=list('requirements');
  const sourceReadAt=new Date(Math.min(...pages.map(p=>+new Date(p.checkedAt))));
  if(+sourceReadAt>+now+60000||+now-+sourceReadAt>30*86400000)add('source','not_current');
  if(!active&&!upcoming)notes.push('Application status or deadline is not confirmed; check the program page');
  if(upcoming)notes.push(`Applications open ${openingDate}; check the program page`);
  if(listing)notes.push('Search/listing page — check the linked program details');
  const hard=!!deadline&&deadline<today;
  const uncertain=!reviewed||!grades&&!hs||gradeConflict||restrictedSchoolYear||minAge!=null||!evidencedName||collegeOnly||!active||reasons.some(r=>r.field==='source');
  const disposition:Qualification['disposition']=hard?'excluded':uncertain?'needs_verification':'verified';
  const supported={schoolLevel:hs?'high_school':'unknown',city,state,currency,costMin,costMax,additionalCosts:extra,hoursMin,hoursMax,openingDate,
    parentConsent:parentConsent?true:null,parentActionDetails:parentConsent?text('parentActionDetails'):null,projectBased:projectBased?true:null,portfolioValue:projectBased?facts.portfolioValue:'unknown'};
  if(disposition==='excluded')return {disposition,reasons};
  const data:CandidateData={name:name!,organizer:organizer||'Organizer not confirmed',opportunityType,applicationStatus:applicationStatus as 'open'|'rolling'|'closed'|'unknown',
    applicationStatusCheckedAt:applicationStatus==='unknown'?null:sourceReadAt,activityDate,url:pages[0].sourceUrl,officialDomain:domain,category,
    gradeMin,gradeMax,minAge,format,region:JSON.stringify(region),costType,costAmount,
    cost:costType==='free'?'Free':costType==='tuition_free_other_costs'?'Tuition free — other required costs':costType==='paid'?costAmount||'Participation fee — check official site':'Cost not confirmed — check the official site',
    costVerifiedAt:costType==='unknown'?null:sourceReadAt,financialAidNote,feeFlag:!reviewed&&(costType==='unknown'||(costMax||costMin||0)>=500),commitment:commitment||'Time commitment not confirmed',
    skills:JSON.stringify(skills),tags:JSON.stringify(tags),checks:JSON.stringify([...new Set(notes)]),deadline,requirements:JSON.stringify(requirements),evidence:JSON.stringify(evidence),
    verificationStatus:disposition,verifiedAt:disposition==='verified'?now:null,sourceCheckedAt:disposition==='verified'?sourceReadAt:null,sourceReadAt,
    qualificationNotes:JSON.stringify(reasons),scoutFacts:JSON.stringify(supported),promptVersion:PROMPT_VERSION,isSample:false};
  return {disposition,reasons,data};
}
