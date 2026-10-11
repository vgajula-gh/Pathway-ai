import { describe, it, expect } from 'vitest';
import { expand, findConflicts, dayCapacity, freeSlots, checkSessions } from '../src/domain/schedule.js';
import { CalEvent, AvailabilityRules } from '../src/domain/types.js';

const rules: AvailabilityRules = { studyStart: '16:00', studyEnd: '21:00', maxStudyMin: 120, downtimeStart: '21:00', downtimeEnd: '23:00' };
const day = '2026-10-14'; // a Wednesday
const ev = (id: string, title: string, type: string, s: string, e: string, recurDays: number[] = []): CalEvent => ({ id, title, type, start: `${day}T${s}`, end: `${day}T${e}`, recurDays });

describe('schedule engine', () => {
  it('expands weekly recurrence', () => {
    const occ = expand([ev('a', 'Soccer', 'sports', '16:00', '17:30', [1, 3])], new Date(2026, 9, 12), new Date(2026, 9, 19));
    expect(occ.length).toBe(1); // Mon 12 is before start (Wed 14); Wed 14 only... next Mon 19 excluded
  });
  it('detects overlaps but ignores exams during class', () => {
    const list = [ev('a', 'Soccer', 'sports', '16:00', '17:30'), ev('b', 'Debate', 'club', '16:30', '17:30'), ev('c', 'School', 'class', '08:00', '15:00'), ev('d', 'Bio exam', 'exam', '09:00', '10:00')];
    const c = findConflicts(expand(list, new Date(2026, 9, 14), new Date(2026, 9, 15)));
    expect(c.length).toBe(1); expect(c[0].kind).toBe('overlap');
  });
  it('computes free time in the study window', () => {
    const cap = dayCapacity([ev('a', 'Soccer', 'sports', '16:00', '17:30')], rules, new Date(2026, 9, 14));
    expect(cap.freeMin).toBe(210); expect(cap.available).toBe(120);
  });
  it('never offers slots in downtime or over the limit', () => {
    const slots = freeSlots([], rules, day, day, 60, 5, new Date(2026, 9, 14, 8));
    expect(slots.length).toBe(2);
    for (const s of slots) expect(s.end <= `${day}T21:00`).toBe(true);
  });
  it('rejects sessions that overlap commitments or downtime', () => {
    const r = checkSessions([ev('a', 'Soccer', 'sports', '16:00', '17:30')], rules, [
      { title: 'Study', type: 'study', start: `${day}T16:30`, end: `${day}T17:00` },
      { title: 'Late study', type: 'study', start: `${day}T21:30`, end: `${day}T22:00` },
      { title: 'Good', type: 'study', start: `${day}T18:00`, end: `${day}T18:45` }]);
    expect(r.ok.map(x => x.title)).toEqual(['Good']); expect(r.problems.length).toBe(2);
  });
});
