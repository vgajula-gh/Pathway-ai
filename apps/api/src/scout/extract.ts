import type {Page} from '../discovery/pages.js';
import {extractionLLM} from '../agent/llm/extraction.js';
import {ScoutFacts,FactsJSON} from './schema.js';
import {extractionSystem} from './prompts.js';
import {relevantPassages} from './passages.js';
import {DiscoveryFailure} from '../discovery/failures.js';
import type {LLMUsage} from '../agent/llm/types.js';

export async function extractScout(pages:Page[],timeoutMs=90000):Promise<{facts:ScoutFacts;usage:LLMUsage|null}> {
  const llm=extractionLLM({timeoutMs});
  const output=await llm.json(extractionSystem(),JSON.stringify({passages:relevantPassages(pages)}),[],4096,FactsJSON);
  const result=ScoutFacts.safeParse(output);
  if(!result.success) {
    const allowed=new Set([...Object.keys(ScoutFacts.shape),...Object.keys(ScoutFacts.shape.evidence.shape)]);
    throw new DiscoveryFailure({stage:'extract',code:'invalid_schema',issues:result.error.issues.slice(0,8).map(i=>({
      field:i.path.map(p=>typeof p==='number'?'item':allowed.has(p)?p:'field').join('.')||'output',code:i.code,
    }))});
  }
  return {facts:result.data,usage:llm.lastUsage||null};
}
