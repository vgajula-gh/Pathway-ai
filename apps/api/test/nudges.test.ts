import { describe, expect, it } from 'vitest';
import { chooseNudge, nudgeAllowed } from '../src/domain/nudges.js';
const rules = { studyStart: '16:00', studyEnd: '20:00', maxStudyMin: 120, downtimeStart: '21:00', downtimeEnd: '23:00' };
const now = new Date(2026, 10, 2, 15), base = { applications: [], events: [], rules, pending: 0, goals: [{ title: 'Learn robotics' }], now };
describe('one gentle daily nudge', () => {
  it('chooses application deadline, then tomorrow exam, approval, then a light-day goal', () => {
    const exam = { id: 'exam', title: 'Biology', type: 'exam', start: '2026-11-03T10:00', end: '2026-11-03T11:00', recurDays: [] };
    expect(chooseNudge({ ...base, applications: [{ name: 'Application', status: 'preparing', deadline: '2026-11-04' }], events: [exam], pending: 1 })?.tab).toBe('explore');
    expect(chooseNudge({ ...base, events: [exam], pending: 1 })?.body).toContain('Biology is tomorrow');
    expect(chooseNudge({ ...base, pending: 1 })?.body).toContain('approval');
    expect(chooseNudge(base)?.body).toContain('Learn robotics');
    expect(chooseNudge({ ...base, goals: [] })).toBeNull();
    expect(chooseNudge({ ...base, events: [{ ...exam, type: 'class', start: '2026-11-02T08:00', end: '2026-11-02T15:00' }] })).toBeNull();
  });
  it('respects opt-out, pause, chosen local time, quiet hours and class times even for tests', () => {
    const settings = { enabled: true, time: '14:00', pausedUntil: null };
    expect(nudgeAllowed(settings, [], now, now)).toBe(true);
    expect(nudgeAllowed({ ...settings, enabled: false }, [], now, now, true)).toBe(false);
    expect(nudgeAllowed({ ...settings, time: '16:00' }, [], now, now)).toBe(false);
    expect(nudgeAllowed({ ...settings, pausedUntil: new Date(+now + 864e5) }, [], now, now)).toBe(false);
    for (const hour of [0, 6, 21, 23]) expect(nudgeAllowed(settings, [], new Date(2026, 10, 2, hour), now, true)).toBe(false);
    const classes = [{ id: 'class', title: 'Class', type: 'class', start: '2026-11-02T14:00', end: '2026-11-02T16:00', recurDays: [] }];
    expect(nudgeAllowed(settings, classes, now, now, true)).toBe(false);
    expect(nudgeAllowed(settings, classes, new Date(2026, 10, 2, 16), now)).toBe(true);
  });
});
