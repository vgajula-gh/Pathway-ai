import {normalizeTopic} from '../discovery/groups.js';
export function interestBatches(interests:string[],maxCalls=3) {
  const topics=[...new Set(interests.map(normalizeTopic).filter(Boolean))].sort().slice(0,Math.max(0,Math.min(3,maxCalls))*2);
  const batches:string[][]=[];for(let i=0;i<topics.length;i+=2)batches.push(topics.slice(i,i+2));return batches;
}
