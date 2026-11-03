import {ScoutFacts,FactFields} from '../../src/scout/schema.js';
import {sourcePassages} from '../../src/scout/passages.js';
import {readable,type Page} from '../../src/discovery/pages.js';
export function scoutFixture(name='Example Robotics',cost:'free'|'paid'='free',extra='') {
  const url=`https://example.edu/${name.toLowerCase().replace(/\W+/g,'-')}`;
  const page:Page={...readable(`<title>${name}</title><main><h1>${name}</h1><p>Organized by Example. Open to grades 9–12 and high school students.</p><p>${cost==='free'?'Participation is free.':'Program fee USD $50.'}</p><p>Online. Applications are now open. Application deadline December 1, 2030.</p><p>Robotics and coding projects. ${extra}</p></main>`,url),checkedAt:new Date()};
  const evidence=Object.fromEntries(Object.keys(FactFields).map(k=>[k,null]));
  for(const field of ['name','organizer','gradeMin','gradeMax','schoolLevel','costType','format','deadline','applicationStatus','tags','projectBased'])evidence[field]=[sourcePassages([page])[0].id];
  if(cost==='paid')for(const field of ['costAmount','costMin','costMax','currency'])evidence[field]=[sourcePassages([page])[0].id];
  const facts=ScoutFacts.parse({...Object.fromEntries(Object.keys(FactFields).map(k=>[k,null])),
    name,organizer:'Example',gradeMin:9,gradeMax:12,schoolLevel:'high_school',format:'online',
    costType:cost,costAmount:cost==='paid'?'USD $50':null,costMin:cost==='paid'?50:null,costMax:cost==='paid'?50:null,currency:cost==='paid'?'USD':'unknown',
    applicationStatus:'open',deadline:'2030-12-01',portfolioValue:'unknown',projectBased:true,tags:['Robotics','coding'],evidence});
  return {page,facts};
}
