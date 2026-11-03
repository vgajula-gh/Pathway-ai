import {expect,it} from 'vitest';
import {Extraction} from '../src/discovery/extraction.js';
import {verifyOpportunity} from '../src/domain/opportunity-verification.js';
import {gradeRangeInQuote} from '../src/domain/opportunity-evidence.js';
import {verifyCandidate} from '../src/discovery/verification.js';
import {failureInfo} from '../src/discovery/failures.js';
import type {Page} from '../src/discovery/pages.js';

const now=new Date('2029-11-01T12:00:00Z');
function fixture(grades:string) {
  const text=`Example Robotics is organized by Example. ${grades} Participation is free. Virtual. Apply by December 1, 2030. Coding.`;
  const page:Page={sourceUrl:'https://example.edu/robotics',pageTitle:'Example Robotics',text,contentHash:'fixture',checkedAt:now,links:[]};
  const facts=Extraction.parse({
    ...Object.fromEntries(Object.keys(Extraction.shape).map(k=>[k,null])),
    name:'Example Robotics',organizer:'Example',gradeMin:9,gradeMax:12,costType:'free',format:'Virtual',deadline:'2030-12-01',
    evidence:Object.fromEntries(['name','organizer','gradeMin','gradeMax','costType','format','deadline'].map(field=>[field,{sourceUrl:page.sourceUrl,quote:
      ['gradeMin','gradeMax'].includes(field)?grades:field==='costType'?'Participation is free.':text}])),
  });
  return {facts,page};
}

it.each([
  'Open to grades 9–12.',
  'Open to grades 9 through 12.',
  'Open to 9th–12th graders.',
  'Open to 9th through 12th grade students.',
  'Open to grades 9, 10, 11, and 12.',
  'Open to grades 9th–12th.',
  'Open to grades 9, 10, 11 & 12.',
  'Open to grades 9—12.',
])('verifies explicit equivalent grade wording: %s',grades=>{
  const {facts,page}=fixture(grades);
  expect(verifyOpportunity(facts,[page],new Set(),now)).toMatchObject({verificationStatus:'verified',gradeMin:9,gradeMax:12});
});

it.each([
  'Open to high school students.',
  'Open to students ages 14–18.',
  'Open to grades 9, 11, and 12.',
  'Open to rising 9th–12th graders.',
  'Open to entering grades 9–12.',
])('does not invent a continuous current grade range from: %s',grades=>{
  const {facts,page}=fixture(grades);
  expect(verifyOpportunity(facts,[page],new Set(),now).verificationStatus).toBe('new_find');
});

it('keeps exact single grades and rejects ambiguous or qualified numeric bounds',()=>{
  expect(gradeRangeInQuote('Open to grade 11.')).toEqual({min:11,max:11});
  expect(gradeRangeInQuote('Open to 11th-grade students.')).toEqual({min:11,max:11});
  for(const quote of ['Grades 9, 11 and 12.','Rising 9th–12th graders.','Grades 9–12; grades 10–11.','Grades 12–9.','Grades 9–13.'])expect(gradeRangeInQuote(quote)).toBeNull();
});

function rejected(change:(f:ReturnType<typeof fixture>)=>void) {
  const f=fixture('Open to grades 9–12.');change(f);
  try{verifyCandidate(f.facts,[f.page],new Set(),now);throw new Error('Expected rejection');}
  catch(error){return failureInfo(error,'verify');}
}
it('reports specific missing grade and format facts without changing the persisted facts shape',()=>{
  expect(rejected(({facts})=>{delete facts.evidence.gradeMax;facts.format=null;})).toMatchObject({stage:'verify',code:'missing_evidence',verification:[{field:'gradeMax',reason:'not_stated'},{field:'format',reason:'not_stated'}]});
  const {facts,page}=fixture('Open to grades 9–12.');
  expect(verifyCandidate(facts,[page],new Set(),now)).not.toHaveProperty('verification');
});
it('separates unfetched sources, missing quotes and unsupported model values',()=>{
  expect(rejected(({facts})=>{facts.evidence.format.sourceUrl='https://unfetched.example.edu/private-value';})).toMatchObject({verification:[{field:'format',reason:'source_not_fetched'}]});
  expect(rejected(({facts})=>{facts.evidence.format.quote='private-quote-not-on-page';})).toMatchObject({verification:[{field:'format',reason:'quote_not_found'}]});
  expect(rejected(({facts})=>{facts.format='private-invented-format';})).toMatchObject({verification:[{field:'format',reason:'value_not_supported'}]});
  const failure=rejected(({facts})=>{facts.organizer='private-invented-organizer';});
  expect(failure).toMatchObject({verification:[{field:'organizer',reason:'value_not_supported'}]});
  expect(JSON.stringify(failure)).not.toContain('private-');
});
it('requires actual numeric evidence for the supplied bounds instead of trusting extraction',()=>{
  expect(rejected(({facts})=>{facts.gradeMin=8;})).toMatchObject({verification:[{field:'gradeMin',reason:'value_not_supported'}]});
});
it('keeps unknown organizer websites excluded until the owner reviews their domain',()=>{
  const f=fixture('Open to grades 9–12.');
  f.page.sourceUrl='https://unfamiliar.org/program';
  for(const e of Object.values(f.facts.evidence))e.sourceUrl=f.page.sourceUrl;
  expect(()=>verifyCandidate(f.facts,[f.page],new Set(),now)).toThrowError(expect.objectContaining({info:expect.objectContaining({stage:'verify',code:'missing_evidence',sourceHost:'unfamiliar.org',verification:[{field:'officialDomain',reason:'unreviewed_domain'}]})}));
  expect(verifyCandidate(f.facts,[f.page],new Set(['unfamiliar.org']),now).verificationStatus).toBe('verified');
});
it('distinguishes unknown active status from an explicitly expired deadline',()=>{
  expect(rejected(({facts})=>{facts.deadline=null;})).toMatchObject({verification:[{field:'applicationStatus',reason:'not_stated'},{field:'deadline',reason:'not_stated'}]});
  expect(rejected(({facts,page})=>{facts.deadline='2028-12-01';page.text+=' Deadline December 1, 2028.';facts.evidence.deadline.quote='Deadline December 1, 2028.';})).toEqual({stage:'verify',code:'deadline_passed',verification:[{field:'deadline',reason:'past_deadline'}]});
});
