import {expect,it} from 'vitest';
import {qualifyScout,freeParticipation,confirmedDate} from '../src/scout/qualify.js';
import {activeOpportunity,explicitApplicationStatus} from '../src/domain/opportunity-active.js';
import {scoutFixture} from './fixtures/scout.js';
const now=new Date('2029-01-01T12:00:00Z');
const check=(f:ReturnType<typeof scoutFixture>,trusted=new Set<string>())=>{f.page.checkedAt=now;return qualifyScout(f.facts,[f.page],trusted,now);};

it('accepts a stated high-school audience without inventing numeric grade bounds',()=>{
 const f=scoutFixture();f.page.text=f.page.text.replace('grades 9–12 and high school students','high school students');f.facts.gradeMin=null;f.facts.gradeMax=null;
 const result=check(f);expect(result.disposition).toBe('verified');expect(result.data).toMatchObject({gradeMin:null,gradeMax:null});
 expect(JSON.parse(result.data!.scoutFacts!).schoolLevel).toBe('high_school');
});
it('derives numeric grade bounds from the literal cited range rather than a wrong model value',()=>{
 const f=scoutFixture();f.facts.gradeMin=8;expect(check(f).data?.gradeMin).toBe(9);
 f.page.text=f.page.text.replace('grades 9–12','grades 11–12');expect(check(f).data).toMatchObject({gradeMin:11,gradeMax:12});
});
it('keeps missing optional organizer and format details visible and explicitly labeled',()=>{
 const f=scoutFixture();f.facts.organizer=null;f.facts.format='unknown';f.facts.evidence.organizer=null;f.facts.evidence.format=null;
 const result=check(f);expect(result.disposition).toBe('verified');expect(result.data).toMatchObject({organizer:'Organizer not confirmed',format:'Format not confirmed'});
 expect(JSON.parse(result.data!.checks)).toContain('Check participation format');
});
it('retains a real active program with an unreviewed domain as needs checking, without a Verified timestamp',()=>{
 const f=scoutFixture();f.page.sourceUrl='https://new-organizer.org/robotics';f.page.checkedAt=now;
 const result=check(f);expect(result).toMatchObject({disposition:'needs_verification',reasons:[{field:'officialDomain',reason:'unreviewed_domain'}]});
 expect(result.data).toMatchObject({verifiedAt:null,sourceCheckedAt:null,sourceReadAt:now});
 expect(activeOpportunity(result.data!,'2029-01-01',now)).toBe(true);
 expect(check(f,new Set(['new-organizer.org'])).disposition).toBe('verified');
});
it('does not hide active unknown eligibility or convert uncertain age into a parent requirement',()=>{
 const f=scoutFixture();f.page.text=f.page.text.replace('Open to grades 9–12 and high school students.','Students may apply.');
 f.facts.gradeMin=null;f.facts.gradeMax=null;f.facts.schoolLevel='unknown';f.facts.evidence.gradeMin=null;f.facts.evidence.gradeMax=null;f.facts.evidence.schoolLevel=null;
 expect(check(f).disposition).toBe('needs_verification');
 const age=scoutFixture('Age check','free','Minimum age 16.');age.facts.minAge=16;age.facts.evidence.minAge=['p0-s0'];age.facts.parentConsent=true;age.facts.evidence.parentConsent=['p0-s0'];
 const result=check(age);expect(result.disposition).toBe('needs_verification');expect(JSON.parse(result.data!.scoutFacts!).parentConsent).toBeNull();
 expect(result.data?.minAge).toBe(16);
});
it('keeps confirmed closed, expired and college-only programs excluded',()=>{
 const old=scoutFixture();old.facts.deadline='2028-12-01';old.page.text=old.page.text.replace('December 1, 2030','December 1, 2028');expect(check(old).disposition).toBe('excluded');
 const closed=scoutFixture();closed.facts.applicationStatus='closed';closed.page.text=closed.page.text.replace('Applications are now open.','Applications are closed.');expect(check(closed).disposition).toBe('excluded');
 const college=scoutFixture('College program','free','This is exclusively for undergraduate students.');expect(check(college).reasons).toContainEqual({field:'schoolLevel',reason:'not_eligible'});
});
it('requires a confirmed future competition deadline even with open registration',()=>{
 const f=scoutFixture('Robotics Challenge');f.facts.deadline=null;f.facts.evidence.deadline=null;
 expect(check(f)).toMatchObject({disposition:'excluded',reasons:expect.arrayContaining([{field:'deadline',reason:'no_confirmed_deadline'}])});
 const normal=scoutFixture();normal.facts.deadline=null;expect(check(normal).disposition).toBe('verified');
});
it('routes announced future application openings to Coming soon and unknown availability to exclusions',()=>{
 const f=scoutFixture('Future program','free','Applications open on February 1, 2029.');f.facts.deadline=null;f.facts.applicationStatus='opening_soon';f.facts.openingDate='2029-02-01';f.facts.evidence.openingDate=['p0-s0'];
 expect(check(f).disposition).toBe('watchlist');expect(activeOpportunity(check(f).data!,'2029-01-01',now)).toBe(false);
 f.facts.openingDate=null;expect(check(f).disposition).toBe('excluded');
});
it('does not convert application or program dates into an unsupported deadline',()=>{
 expect(confirmedDate('2030-12-01','Program starts December 1, 2030.','deadline')).toBeNull();
 expect(confirmedDate('2030-12-01','Application deadline: 01 December 2030.','deadline')).toBe('2030-12-01');
 expect(confirmedDate('2030-02-29','Application deadline 2030-02-29.','deadline')).toBeNull();
});
it.each(['Participation is free.','Tuition is free.','No tuition or program fees.'])('accepts explicit free participation: %s',quote=>{
 expect(freeParticipation(quote)).toBe(true);
});
it.each(['Free application.','Free resources.','Free trial.','Tuition is free. Mandatory materials fee USD $25.'])('does not label this Free: %s',quote=>{
 expect(freeParticipation(quote)).toBe(false);
});
it('keeps tuition-free programs with mandatory charges out of Free and preserves exact cost evidence',()=>{
 const f=scoutFixture();f.page.text=f.page.text.replace('Participation is free.','Tuition is free. Mandatory materials fee USD $25.');
 f.facts.costType='tuition_free_other_costs';f.facts.additionalCosts='Mandatory materials fee USD $25.';f.facts.evidence.additionalCosts=['p0-s0'];
 expect(check(f).data?.costType).toBe('tuition_free_other_costs');
 const internship=scoutFixture('Internship','free','This internship pays students USD $500.');internship.facts.costType='paid';
 expect(check(internship).data?.costType).toBe('free');
});
it('does not call tuition-free participation Free when mandatory extras are unpriced',()=>{
 const f=scoutFixture();f.page.text=f.page.text.replace('Participation is free.','Tuition is free. Mandatory materials fees apply.');
 expect(check(f).data?.costType).not.toBe('free');
});
it('keeps restricted school years uncertain and preserves literal state/country restrictions',()=>{
 const f=scoutFixture();f.page.text=f.page.text.replace('Open to grades 9–12 and high school students.','Open to high school students. Only high school seniors may apply.');f.facts.gradeMin=null;f.facts.gradeMax=null;
 expect(check(f).disposition).toBe('needs_verification');
 const regional=scoutFixture('Regional program','free','Only United States residents are eligible.');regional.facts.region=['United States'];regional.facts.evidence.region=['p0-s0'];expect(JSON.parse(check(regional).data!.region)).toEqual(['US']);
});
it('rejects unsupported program names and source references without inventing replacement quotes',()=>{
 const f=scoutFixture();f.facts.name='Invented program';expect(check(f).disposition).toBe('excluded');
 const bad=scoutFixture();bad.facts.evidence.name=['p99-s99'];expect(check(bad).disposition).toBe('excluded');
});
it('recognizes present accepting statements without allowing future or negative statements',()=>{
 expect(explicitApplicationStatus('open','Currently accepting applications.')).toBe(true);
 expect(explicitApplicationStatus('open','Applications open now.')).toBe(true);
 expect(explicitApplicationStatus('open','Applications open February 1, 2030.')).toBe(false);
 expect(explicitApplicationStatus('open','We are not accepting applications.')).toBe(false);
});
it('keeps search-result pages and listicles out of the program catalog',()=>{
 const f=scoutFixture();f.page.pageTitle='Top 10 Robotics Programs';expect(check(f)).toMatchObject({disposition:'excluded',reasons:expect.arrayContaining([{field:'source',reason:'low_quality_source'}])});
});
