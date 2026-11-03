import {ScoutFacts,FactFields} from './schema.js';
import {sourcePassages} from './passages.js';
import {readable} from '../discovery/pages.js';
import {qualifyScout} from './qualify.js';
export function checkScoutFixture(now=new Date()) {
  const deadline=new Date(+now+60*86400000).toISOString().slice(0,10),name='Pathway Scout synthetic fixture';
  const page={...readable(`<title>${name}</title><main><h1>${name}</h1><p>Organized by Example. Open to high school students. Participation is free. Online. Applications are now open. Application deadline ${deadline}. Students build coding projects.</p></main>`,'https://pathway-fixture.example.edu/program'),checkedAt:now};
  const evidence:Record<string,string[]|null>=Object.fromEntries(Object.keys(FactFields).map(k=>[k,null]));
  for(const k of ['name','organizer','schoolLevel','costType','format','applicationStatus','deadline','tags','projectBased'])evidence[k]=[sourcePassages([page])[0].id];
  const facts=ScoutFacts.parse({...Object.fromEntries(Object.keys(FactFields).map(k=>[k,null])),name,organizer:'Example',schoolLevel:'high_school',costType:'free',format:'online',applicationStatus:'open',deadline,tags:['coding'],projectBased:true,currency:'unknown',portfolioValue:'unknown',evidence});
  const result=qualifyScout(facts,[page],new Set(),now);
  return {mode:'fixture',synthetic:true,providerRequests:0,ok:result.disposition==='verified',disposition:result.disposition,reasons:result.reasons,sourceFields:Object.keys(JSON.parse(result.data?.evidence||'{}'))};
}
