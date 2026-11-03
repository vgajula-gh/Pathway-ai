import {expect,it} from 'vitest';
import {DiscoveryPreferences,discoveryPreferences} from '../src/domain/discovery-preferences.js';
import {ScoutFacts,ResearchOutput,ResearchJSON,FactsJSON} from '../src/scout/schema.js';
import {scoutPrompt,publicSearchContext,PROMPT_VERSION} from '../src/scout/prompts.js';
import {sourcePassages,resolveEvidence} from '../src/scout/passages.js';
import {readable} from '../src/discovery/pages.js';
import {interestBatches} from '../src/scout/planning.js';

it('keeps optional preferences unknown and validates numeric limits',()=>{
 expect(discoveryPreferences('{}')).toMatchObject({radiusMiles:50,format:'both',hoursPerWeek:null,maxCost:null});
 expect(DiscoveryPreferences.parse({hoursPerWeek:0,maxCost:0})).toMatchObject({hoursPerWeek:0,maxCost:0});
 expect(DiscoveryPreferences.safeParse({hoursPerWeek:169}).success).toBe(false);
 expect(DiscoveryPreferences.safeParse({maxCost:-1}).success).toBe(false);
});
it('renders public interests and focus without forwarding private profile fields or unresolved templates',()=>{
 const ctx={today:'2026-11-02',gradeBand:'9-10',interests:['AI','business','coding'],focusInterests:['AI','coding'],region:'NC',buckets:['free','paid'] as ('free'|'paid')[],name:'private-name',goals:'private-goal',personalProject:'private-project'};
 const prompt=scoutPrompt(ctx);
 expect(prompt).toContain('business');expect(prompt).toContain('AI');expect(prompt).not.toContain('private-');expect(prompt).not.toContain('{{');
 expect(publicSearchContext(ctx)).not.toHaveProperty('name');expect(PROMPT_VERSION).toBe('scout-v1');
});
it('validates research leads and generates closed schemas with nullable source evidence',()=>{
 expect(ResearchOutput.safeParse({candidates:[{name:'Program',officialUrl:'http://example.edu',interests:['coding'],costHint:'free'}],searchThemesUsed:[]}).success).toBe(false);
 expect(ResearchJSON.schema).toMatchObject({type:'object',additionalProperties:false});
 expect(FactsJSON.schema).toMatchObject({type:'object',additionalProperties:false});
 expect(ScoutFacts.safeParse({verificationStatus:'verified'}).success).toBe(false);
});
it('preserves heading, paragraph, break and table boundaries and a real source title',()=>{
 const page=readable('<title>Startup Studio — Example University</title><main><h1>Startup Studio</h1><p>For high school students.</p><table><tr><th>Grades</th><td>9–12</td></tr></table><div>Format:<br>Online</div></main>','https://example.edu/program');
 expect(page.text).toBe('Startup Studio — Example University Startup Studio For high school students. Grades 9–12 Format: Online');
 expect(readable('<main>ST<span>EM</span> program</main>','https://example.edu').text).toBe('STEM program');
});
it('constructs literal evidence only from supplied source passage IDs',()=>{
 const page={...readable('<main>Program details for high school students. Applications are now open.</main>','https://example.edu'),checkedAt:new Date()};
 const passages=sourcePassages([page]);
 const facts={evidence:{name:[passages[0].id],organizer:['p99-s99']}} as unknown as import('../src/scout/schema.js').ScoutFacts;
 expect(resolveEvidence(facts,passages)).toEqual({name:{sourceUrl:page.sourceUrl,quote:page.text}});
});
it('covers focus interests with no more than two per bounded research call',()=>{
 expect(interestBatches(['AI','coding','Business','engineering','entrepreneurship',' AI '])).toEqual([['ai','business'],['coding','engineering'],['entrepreneurship']]);
 expect(interestBatches(['a','b','c'],1)).toEqual([['a','b']]);
});
