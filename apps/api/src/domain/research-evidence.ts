import {FactFields,ScoutFacts,type ResearchOutput} from '../scout/schema.js';
import {sourcePassages} from '../scout/passages.js';
import {normalizeEvidence} from './scout-qualification.js';
import {gradeRangeInQuote} from './opportunity-evidence.js';
import type {Page} from '../discovery/pages.js';

type Lead=ResearchOutput['candidates'][number];
/** Research assertions become facts only after their quote is found on a fetched
 * source. Numbered references always resolve to the actual page text. */
export function confirmedResearchFacts(lead:Lead,pages:Page[]):ScoutFacts {
  const facts=ScoutFacts.parse({...Object.fromEntries(Object.keys(FactFields).map(k=>[k,null])),name:lead.name,
    schoolLevel:'unknown',format:'unknown',costType:'unknown',currency:'unknown',applicationStatus:'unknown',portfolioValue:'unknown',
    evidence:Object.fromEntries(Object.keys(FactFields).map(k=>[k,null]))});
  const passages=sourcePassages(pages),details=lead.details;
  const refs=(text:string,url?:string)=>{
    // The secure fetcher established this redirect; retain its final source URL.
    if(url===lead.officialUrl&&pages[0])url=pages[0].sourceUrl;
    const needle=normalizeEvidence(text);if(!needle)return null;
    for(let i=0;i<passages.length;i++)for(let count=1;count<=2;count++) {
      const selected=passages.slice(i,i+count);
      if(selected.length!==count||selected.some(p=>p.sourceUrl!==(url||selected[0].sourceUrl)))continue;
      if(normalizeEvidence(selected.map(p=>p.text).join(' ')).includes(needle))return selected.map(p=>p.id);
    }
    return null;
  };
  facts.evidence.name=refs(lead.name);
  if(!details)return facts;
  const evidence=(key:string)=>details.evidence.find(e=>e.field===key&&refs(e.quote,e.sourceUrl));
  const bind=(field:keyof typeof FactFields,from:string=field)=>{
    const e=evidence(from);if(e)facts.evidence[field]=refs(e.quote,e.sourceUrl);return e;
  };
  for(const field of ['organizer','category','costAmount','financialAidNote','deadline','city','state'] as const) {
    const e=bind(field);if(e)facts[field]=details[field];
  }
  for(const field of ['costType','applicationStatus','format'] as const) {
    const e=bind(field);if(e)(facts as Record<string,unknown>)[field]=details[field];
  }
  const grade=evidence('gradeEligibility');
  if(grade){
    const range=gradeRangeInQuote(grade.quote);
    if(range){facts.gradeMin=range.min;facts.gradeMax=range.max;bind('gradeMin','gradeEligibility');bind('gradeMax','gradeEligibility');}
    if(/\bhigh[ -]school\b/i.test(grade.quote)){facts.schoolLevel='high_school';bind('schoolLevel','gradeEligibility');}
  }
  const age=evidence('ageEligibility'),minimum=age?.quote.match(/\b(?:minimum age|at least|aged?)\s+(\d{1,2})\b/i);
  if(minimum){facts.minAge=Number(minimum[1]);bind('minAge','ageEligibility');}
  return facts;
}

/** Unconfirmed research is presented as a report, never an established fact. */
export function researchWarnings(lead:Lead):string[] {
  const d=lead.details;if(!d)return [];
  const reported=[d.gradeEligibility&&`Eligibility: ${d.gradeEligibility}`,d.ageEligibility&&`Age: ${d.ageEligibility}`,
    d.costType!=='unknown'&&`Cost: ${d.costType.replaceAll('_',' ')}${d.costAmount?' '+d.costAmount:''}`,
    d.deadline&&`Deadline: ${d.deadline}`,d.applicationStatus!=='unknown'&&`Applications: ${d.applicationStatus}`,
    d.format!=='unknown'&&`Format: ${d.format}`,d.city&&`Location: ${d.city}${d.state?', '+d.state:''}`].filter(Boolean);
  return reported.length?[`AI research reports (not confirmed): ${reported.join('; ')}. Check the program page.`]:[];
}
