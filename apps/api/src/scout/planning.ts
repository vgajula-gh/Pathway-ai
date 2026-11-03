import {normalizeTopic} from '../discovery/groups.js';
import type {ResearchOutput} from './schema.js';
export function interestBatches(interests:string[],maxCalls=3) {
  const topics=[...new Set(interests.map(normalizeTopic).filter(Boolean))].sort().slice(0,Math.max(0,Math.min(3,maxCalls))*2);
  const batches:string[][]=[];for(let i=0;i<topics.length;i+=2)batches.push(topics.slice(i,i+2));return batches;
}
export function balancedLeads(leads:ResearchOutput['candidates']) {
  const free=leads.filter(c=>c.costHint==='free'),paid=leads.filter(c=>c.costHint!=='free'),ordered:ResearchOutput['candidates']=[];
  for(let i=0;i<Math.max(free.length,paid.length);i++){if(free[i])ordered.push(free[i]);if(paid[i])ordered.push(paid[i]);}
  return ordered;
}
