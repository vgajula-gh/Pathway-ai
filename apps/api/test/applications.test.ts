import { describe, expect, it } from 'vitest';
import { ApplicationPatch, initialChecklist, countdown, dueSoon, prepActions } from '../src/domain/applications.js';
import { checkSessions } from '../src/domain/schedule.js';
const rules = { studyStart: '16:00', studyEnd: '18:00', maxStudyMin: 30, downtimeStart: '17:30', downtimeEnd: '23:00' };
describe('student application tracker', () => {
  it('counts actual calendar days, including DST and leap dates', () => {
    expect(countdown('2026-11-02', '2026-11-01')).toEqual({ days: 1, label: '1 day left' });
    expect(countdown('2028-02-29', '2028-02-29')?.label).toBe('Due today');
    expect(countdown('2026-10-31', '2026-11-01')?.label).toBe('Deadline passed');
    expect(countdown(null, '2026-11-01')).toBeNull();
  });
  it('validates status changes and rejects invented or impossible dates', () => {
    for (const status of ['interested', 'preparing', 'applied', 'result']) expect(ApplicationPatch.parse({ status }).status).toBe(status);
    expect(() => ApplicationPatch.parse({ status: 'accepted' })).toThrow();
    expect(() => ApplicationPatch.parse({ deadline: '2026-02-30' })).toThrow();
    expect(ApplicationPatch.parse({ deadline: null }).deadline).toBeNull();
  });
  it('prefills unique steps from the opportunity without marking them done', () => {
    expect(initialChecklist(['Check grade', 'Confirm deadline on the official site', 'Check grade'])).toEqual([{ title: 'Check grade', done: false }, { title: 'Confirm deadline on the official site', done: false }]);
  });
  it('selects only active applications due today through day seven', () => {
    const list = [{ status: 'interested', deadline: '2026-11-08' }, { status: 'preparing', deadline: '2026-11-01' }, { status: 'applied', deadline: '2026-11-02' }, { status: 'result', deadline: '2026-11-03' }, { status: 'interested', deadline: null }, { status: 'interested', deadline: '2026-10-31' }, { status: 'interested', deadline: '2026-11-09' }];
    expect(dueSoon(list, '2026-11-01').map(a => a.deadline)).toEqual(['2026-11-01', '2026-11-08']);
  });
  it('proposes actual free time before the deadline without overfilling study or downtime', () => {
    const actions = prepActions('Test', '2026-11-06', [], rules, new Date(2026, 10, 1, 15));
    expect(actions.some(a => a.eventType === 'reminder')).toBe(true);
    expect(actions.some(a => a.eventType === 'study')).toBe(true);
    expect(actions.every(a => a.end < '2026-11-06')).toBe(true);
    expect(checkSessions([], rules, actions.map(a => ({ ...a, type: a.eventType }))).problems).toEqual([]);
    expect(prepActions('Test', '2026-11-01', [], rules, new Date(2026, 10, 1, 15))).toEqual([]);
  });
});
