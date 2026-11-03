// Transparent opportunity eligibility + fit. Hard exclusions win over weighted ranking.
// Never present the numeric score to students as objective truth; show factors instead.
import {normalizeTopic} from '../discovery/groups.js';
import {dkey,wallNow} from './time.js';
import { StudentContext } from './types.js';
import {publicScoutFacts,scoutPreferenceChecks,scoutScore} from './scout-scoring.js';
import {normalizedRegion} from './regions.js';

export interface Opp { id: string; name: string; category: string; gradeMin: number | null; gradeMax: number | null; region?: string[]; verificationStatus?: string; minAge?: number | null; format: string; cost: string; commitment: string; skills: string[]; tags: string[]; checks: string[]; sourceCheckedAt?: Date | null; deadline?: string | null; sourceReadAt?:Date|null;scoutFacts?:string;promptVersion?:string;costType?:string }
export type FactorState = 'ok' | 'mid' | 'no' | 'na';
export interface Factor { key: string; state: FactorState; text: string }

export function eligibility(o: Opp, s: StudentContext) {
  const reasons: string[] = [], checks = [...o.checks];
  if ((o.gradeMin != null && s.grade < o.gradeMin) || (o.gradeMax != null && s.grade > o.gradeMax)) reasons.push(o.gradeMin === o.gradeMax ? `Only for grade ${o.gradeMin}` : `For grades ${o.gradeMin}–${o.gradeMax}`);
  if (o.deadline && o.deadline < (s.timezone?dkey(wallNow(s.timezone)):new Date().toISOString().slice(0,10))) reasons.push('The deadline has passed');
  if ((o.gradeMin == null || o.gradeMax == null)&&publicScoutFacts(o).schoolLevel!=='high_school') checks.push('Grade eligibility is not confirmed');
  if (o.verificationStatus === 'expired') reasons.push('The deadline has passed');
  if (s.region === 'virtual' && !/virtual|online/i.test(o.format)) reasons.push('You chose virtual opportunities only');
  if (s.region && s.region !== 'virtual' && o.region?.length && !o.region.some(r => ['virtual', 'US', normalizedRegion(s.region!)].includes(normalizedRegion(r)))) reasons.push('Outside your selected region');
  if (o.minAge) checks.push(`Minimum age ${o.minAge}`);
  if (s.budget === 'free' && !/^free/i.test(o.cost)) checks.push(`Cost: ${o.cost}`);
  if (s.format === 'virtual' && !/virtual|online|application/i.test(o.format)) checks.push('In-person participation');
  const preference=scoutPreferenceChecks(o,s);reasons.push(...preference.reasons);checks.push(...preference.checks);
  return { status: reasons.length ? 'not_eligible' : checks.length ? 'check' : 'eligible', reasons, checks } as const;
}

export const WEIGHTS = { interest: 0.3, goal: 0.2, schedule: 0.15, cost: 0.15, readiness: 0.1, source: 0.1 };

export function scoreOpportunity(o: Opp, s: StudentContext, weekFreeMin: number) {
  const e = eligibility(o, s);
  if (e.status === 'not_eligible') return { id: o.id, excluded: true as const, eligibility: e };
  if(o.promptVersion==='scout-v1')return scoutScore(o,s,weekFreeMin,e);
  const matched = s.interests.filter(n => o.tags.some(t => {const tag=normalizeTopic(t),interest=normalizeTopic(n);return !!tag&&!!interest&&(tag.includes(interest)||interest.includes(tag));}));
  const goalText = s.goals.join(' ').toLowerCase();
  const goalHit = o.tags.some(t => goalText.includes(t)) || o.skills.some(k => goalText.includes(k.toLowerCase().split(' ')[0]));
  const effort = /^High/i.test(o.commitment) ? 3 : /^Medium/i.test(o.commitment) ? 2 : 1;
  const schedule = weekFreeMin >= effort * 120 ? 1 : weekFreeMin >= effort * 60 ? 0.5 : 0;
  const cost = /^free/i.test(o.cost) ? 1 : s.budget === 'free' ? 0 : 0.6;
  const ready = o.skills.some(k => s.skills.some(x => k.toLowerCase().includes(x.toLowerCase().split(' ').pop() || '~'))) ? 1 : 0.5;
  const verified = !!o.sourceCheckedAt;
  const score = WEIGHTS.interest * Math.min(1, matched.length / 2) + WEIGHTS.goal * (goalHit ? 1 : 0) + WEIGHTS.schedule * schedule + WEIGHTS.cost * cost + WEIGHTS.readiness * ready + WEIGHTS.source * (verified ? 1 : 0.5);
  const fit = score >= 0.55 ? 'strong' : score >= 0.38 ? 'good' : 'look';
  const hours = Math.round(weekFreeMin / 60);
  const factors: Factor[] = [
    { key: 'Interests', state: matched.length ? 'ok' : 'mid', text: matched.length ? `Matches ${matched.slice(0, 2).join(', ')}` : 'Outside your listed interests' },
    { key: 'Eligible', state: e.status === 'eligible' ? 'ok' : 'mid', text: e.status === 'eligible' ? `Open to grade ${s.grade}` : `Check: ${e.checks.join('; ')}` },
    { key: 'Time', state: schedule === 1 ? 'ok' : schedule ? 'mid' : 'no', text: `${o.commitment}. About ${hours}h free this week.` },
    { key: 'Cost', state: cost === 1 ? 'ok' : cost ? 'mid' : 'no', text: o.cost },
    { key: 'Ready', state: ready === 1 ? 'ok' : 'mid', text: ready === 1 ? 'Uses skills you have' : `Uses ${o.skills.join(', ')}; a little prep helps` },
    { key: 'Source', state: verified ? 'ok' : 'na', text: verified ? `Checked ${o.sourceCheckedAt!.toISOString().slice(0, 10)}` : 'Not verified for this year' }
  ];
  const why = matched.length || goalHit ? `Suggested because ${[matched.length ? `it lines up with your interest in ${matched.slice(0, 2).join(' and ')}` : '', goalHit ? 'it moves your goal forward' : ''].filter(Boolean).join(' and ')}.` : 'A chance to try something new.';
  return { id: o.id, excluded: false as const, eligibility: e, score, fit, factors, why, matched, goalHit };
}
