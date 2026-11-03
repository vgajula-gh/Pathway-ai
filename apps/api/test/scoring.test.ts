import { describe, it, expect } from 'vitest';
import { eligibility, scoreOpportunity } from '../src/domain/scoring.js';

const student = { grade: 10, interests: ['AI', 'Coding'], skills: ['basic Python'], budget: 'any', format: 'any', goals: ['Build my first AI app'] };
const opp = { id: 'x', name: 'App Challenge', category: 'STEM competition', gradeMin: 9, gradeMax: 12, format: 'Virtual', cost: 'Free', commitment: 'Medium: weeks', skills: ['programming'], tags: ['coding', 'ai', 'apps'], checks: [] };

describe('opportunity scoring', () => {
  it('reports ineligible grades as warnings without hiding a result', () => {
    expect(eligibility({ ...opp, gradeMin: 12 }, student).status).toBe('not_eligible');
    expect(scoreOpportunity({ ...opp, gradeMin: 12 }, student, 600).excluded).toBe(false);
  });
  it('hard-excludes passed deadlines', () => {
    expect(eligibility({ ...opp, deadline: '2000-01-01' }, student).status).toBe('not_eligible');
  });
  it('explains fit with factors and never marks unverified sources as verified', () => {
    const r = scoreOpportunity(opp, student, 600);
    if (r.excluded) throw new Error('should not be excluded');
    expect(r.fit).toBe('strong');
    expect(r.factors.find(f => f.key === 'Source')!.state).toBe('na');
    expect(r.why).toMatch(/AI|Coding/);
  });
  it('flags cost for free-only budgets', () => {
    expect(eligibility({ ...opp, cost: 'Team fees vary' }, { ...student, budget: 'free' }).checks.join()).toMatch(/Cost/);
  });
});
