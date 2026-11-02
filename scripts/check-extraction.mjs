// Owner diagnostic: no database, page fetch, catalog write or vector operation.
import {extract} from '../apps/api/src/discovery/extraction.ts';
import {extractionSettings} from '../apps/api/src/agent/llm/extraction.ts';
import {discoveryModels} from '../apps/api/src/discovery/config.ts';
import {failureInfo,DiscoveryFailure} from '../apps/api/src/discovery/failures.ts';
import {env} from '../apps/api/src/lib/env.ts';
import {verifyOpportunity} from '../apps/api/src/domain/opportunity-verification.ts';

const live=process.argv.includes('--live'),settings=extractionSettings();
const report={mode:live?'live':'configuration',models:discoveryModels(),checkedAt:new Date().toISOString()};
const missing=[];
if(!settings.model)missing.push('AI_MODEL_EXTRACTION or provider model');
if(settings.model&&!report.models.extraction.model)missing.push('valid AI model ID');
if(env.aiDisabled)missing.push('AI_DISABLED=false and provider API key');
if(missing.length){
  console.log(JSON.stringify({...report,ok:false,missing},null,2));process.exitCode=1;
} else if(!live){
  console.log(JSON.stringify({...report,ok:true,note:'Configuration only. Add --live for one hosted extraction request on synthetic text; it can incur a small provider charge.'},null,2));
} else {
  // A fixture, never a real recommendation. No student information enters this call.
  const text='Example Robotics is organized by Example. Open to grades 9–12. Participation is free. Virtual. The application deadline is December 1, 2030.';
  const page={sourceUrl:'https://example.edu/robotics',pageTitle:'Synthetic extraction check',text,contentHash:'diagnostic-fixture',checkedAt:new Date(),links:[]};
  let stage='extract';
  try{
    const facts=await extract([page]);
    stage='verify';
    const verified=verifyOpportunity(facts,[page],new Set(['example.edu']));
    if(verified.verificationStatus!=='verified')throw new DiscoveryFailure({stage:'verify',code:'missing_evidence'});
    console.log(JSON.stringify({...report,ok:true,verified:true,costType:verified.costType,note:'Extraction, local schema validation and evidence verification passed for the synthetic fixture. It was not saved. Real source access and indexing are separate steps.'},null,2));
  } catch(error){
    console.log(JSON.stringify({...report,ok:false,failure:failureInfo(error,stage)},null,2));process.exitCode=1;
  }
}
