import {ResearchOutput} from './schema.js';
import type {PublicSearchContext} from './prompts.js';
import {parseJSON,type LLMUsage} from '../agent/llm/types.js';
import {DiscoveryFailure} from '../discovery/failures.js';

export type ResearchResponse={text:string;usage:LLMUsage;citations:string[]};
export type ResearchProvider={research(context:PublicSearchContext,count:number):Promise<ResearchResponse>};
export function researchOutput(text:string) {
  let parsed:unknown;
  try{parsed=parseJSON(text);}catch{throw new DiscoveryFailure({stage:'search',code:'invalid_json'});}
  const value=ResearchOutput.safeParse(parsed);
  if(!value.success)throw new DiscoveryFailure({stage:'search',code:'invalid_schema',issues:[{field:'output',code:'invalid_type'}]});
  return value.data;
}
export function validResearch(value:unknown){return ResearchOutput.parse(value);}
