import {prisma,j} from '../lib/db.js';
import {StudentContext} from '../domain/types.js';
import {eligibility} from '../domain/scoring.js';
import {toOpp} from '../lib/picks.js';
import {costLabel} from '../domain/picks.js';
type Program=Awaited<ReturnType<typeof prisma.opportunity.findUniqueOrThrow>>;
export function structuredFacts(o:Program,ctx:StudentContext) {
  const fit=eligibility(toOpp(o),ctx),evidence=j<Record<string,{sourceUrl:string}>>(o.evidence,{});
  return {
    source:{value:o.verificationStatus==='verified'?'Source verified':o.verificationStatus==='needs_verification'?'Page read; details need checking. '+j<string[]>(o.checks,[]).join('; '):'Details need another check',sourceUrl:o.url},
    deadline:{value:o.deadline&&evidence.deadline?o.deadline:'Not confirmed — check the official site',sourceUrl:evidence.deadline?.sourceUrl},
    cost:{value:costLabel(toOpp(o)),sourceUrl:evidence.costType?.sourceUrl},
    eligibility:{value:fit.status==='not_eligible'?fit.reasons.join('; '):fit.status==='check'?`Please confirm: ${fit.checks.join('; ')}`:'Your grade fits the listed school audience. Other program requirements may apply.',sourceUrl:evidence.gradeMin?.sourceUrl||evidence.schoolLevel?.sourceUrl},
    status:{value:o.verificationStatus==='expired'?'Deadline passed':o.verificationStatus==='stale'?'Details need another check':o.applicationStatus==='unknown'?'Application status not confirmed':o.applicationStatus,sourceUrl:evidence.applicationStatus?.sourceUrl},
  };
}
export function requestedFacts(query:string) {
  const keys:('deadline'|'cost'|'eligibility'|'status')[]=[];
  if(/deadline|due\b|when.*(?:apply|close)/i.test(query))keys.push('deadline');
  if(/\bcost|\bfee|tuition|\bfree\b|\bpaid\b|expensive/i.test(query))keys.push('cost');
  if(/eligib|grade|age\b|qualif/i.test(query))keys.push('eligibility');
  if(/\bstatus|\bopen\b|rolling|\bclosed\b|active|expired/i.test(query))keys.push('status');
  return keys;
}
// Structured assertions are rendered from SQL, rather than quoted back as current facts.
export const structuredExcerpt=(quote:string)=>/\bdeadline|\bdue\b|\bcost|\bfees?\b|tuition|\bfree\b|\bpaid\b|\beligib|\bgrades?\b|\bage\b|applications?.{0,25}\b(?:open|closed|rolling)\b|\$\s*\d|\b20\d\d[-/]\d/i.test(quote);
