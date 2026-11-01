import { StudentContext } from '../domain/types.js';
export const normalizeTopic=(v:string)=>v.normalize('NFKC').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu,' ').trim().slice(0,60);
export function interestGroups(student:Pick<StudentContext,'interests'|'grade'|'region'>){
 const band=student.grade<=10?'9-10':'11-12',region=student.region||'US';
 // One group per topic, not per student's unique combination of interests.
 return [...new Set(student.interests.map(normalizeTopic).filter(Boolean))].sort().slice(0,5).map(topic=>({key:`${topic}|${band}|${region}`,topic,gradeBand:band,region}));
}
export function discoveryQuery(group:{topic:string;gradeBand:string;region:string},bucket:'free'|'paid',year:number){return `high school ${group.topic} programs grades ${group.gradeBand} ${group.region==='virtual'?'online virtual':group.region} ${bucket==='free'?'free no participation fee':'programs fees financial aid'} ${year} official eligibility application`;}
export const identity=(domain:string,name:string)=>`${domain.replace(/^www\./,'').toLowerCase()}|${normalizeTopic(name)}`;
