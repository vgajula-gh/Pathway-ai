import {it,expect} from 'vitest';
import {confirmedDate,supportedProgramName,qualifyScout} from '../src/domain/scout-qualification.js';
import {confirmedResearchFacts} from '../src/domain/research-evidence.js';
import {ResearchDetails} from '../src/scout/schema.js';
import {scoutFixture} from './fixtures/scout.js';

it.each(['Applications accepted until March 14, 2030.','Registration closes Thursday, Mar 14, 2030.','Last day: 3/14/2030.','Apply by 14 March 2030.'])('confirms common explicit-year deadline wording: %s',quote=>{
 expect(confirmedDate('2030-03-14',quote,'deadline')).toBe('2030-03-14');
});
it('never turns a missing year, an impossible date, or an unrelated date into a deadline',()=>{
 expect(confirmedDate('2030-03-14','Apply by March 14.','deadline')).toBeNull();
 expect(confirmedDate('2030-02-30','Deadline February 30, 2030.','deadline')).toBeNull();
 expect(confirmedDate('2030-03-14','The program begins March 14, 2030.','deadline')).toBeNull();
});
it('allows punctuation variants without inventing name words or a missing year',()=>{
 expect(supportedProgramName('STEM & Robotics Program','The STEM and Robotics program')).toBe(true);
 expect(supportedProgramName('STEM & Robotics 2030','STEM and Robotics 2029')).toBe(false);
 expect(supportedProgramName('Future Scholars','Different Scholars')).toBe(false);
});
it('never verifies a research quotation that is missing from the actual source or attributed to another page',()=>{
 const f=scoutFixture();const details=ResearchDetails.parse({...Object.fromEntries(Object.keys(ResearchDetails.shape).map(k=>[k,null])),costType:'free',applicationStatus:'open',format:'online',deadline:'2030-12-01',evidence:[
  {field:'costType',quote:'Participation is free.',sourceUrl:'https://unrelated.edu'},
  {field:'deadline',quote:'Application deadline January 1, 2030.',sourceUrl:f.page.sourceUrl},
 ]});
 const facts=confirmedResearchFacts({name:f.facts.name!,officialUrl:f.page.sourceUrl,interests:[],costHint:'free',details},[f.page]);
 const result=qualifyScout(facts,[f.page],new Set());expect(result.disposition).toBe('needs_verification');expect(result.data).toMatchObject({deadline:null,costType:'unknown',sourceCheckedAt:null});expect(result.data!.evidence).not.toContain('unrelated.edu');
});
