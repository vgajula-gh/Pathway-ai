import { describe, expect, it } from 'vitest';
import { parseCalendar, weekSummary } from '../src/domain/calendars.js';
import { publicAddress, publicCalendarUrl, pinnedLookup } from '../src/lib/calendar-fetch.js';
const body = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;
const event = (extra: string) => `BEGIN:VEVENT\r\nUID:test\r\nDTSTAMP:20261001T120000Z\r\nSUMMARY:Math class\r\n${extra}\r\nEND:VEVENT`;
describe('calendar import and week facts', () => {
  it('expands weekly TZID recurrence across DST while preserving local class time', () => {
    const ics = body(event('DTSTART;TZID=America/New_York:20261026T090000\r\nDTEND;TZID=America/New_York:20261026T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3'));
    const events = parseCalendar(ics, 'America/New_York', 'class', new Date('2026-11-01T12:00Z'));
    expect(events.map(e => e.start)).toEqual(['2026-10-26T09:00', '2026-11-02T09:00', '2026-11-09T09:00']);
  });
  it('converts UTC events and treats floating times as student-local', () => {
    expect(parseCalendar(body(event('DTSTART:20261102T140000Z\r\nDTEND:20261102T150000Z')), 'America/New_York', 'class', new Date('2026-11-01T12:00Z'))[0].start).toBe('2026-11-02T09:00');
    expect(parseCalendar(body(event('DTSTART:20261102T090000\r\nDTEND:20261102T100000')), 'America/New_York', 'class', new Date('2026-11-01T12:00Z'))[0].start).toBe('2026-11-02T09:00');
  });
  it('honors excluded dates, changed occurrences and cancellations', () => {
    const base = event('DTSTART;TZID=America/New_York:20261026T090000\r\nDTEND;TZID=America/New_York:20261026T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE;TZID=America/New_York:20261102T090000');
    const override = event('RECURRENCE-ID;TZID=America/New_York:20261109T090000\r\nDTSTART;TZID=America/New_York:20261109T120000\r\nDTEND;TZID=America/New_York:20261109T130000');
    expect(parseCalendar(body(base + '\r\n' + override), 'America/New_York', 'class', new Date('2026-11-01T12:00Z')).map(e => e.start)).toEqual(['2026-10-26T09:00', '2026-11-09T12:00']);
    expect(parseCalendar(body(event('DTSTART:20261102T090000Z\r\nDTEND:20261102T100000Z\r\nSTATUS:CANCELLED')), 'UTC', 'class', new Date('2026-11-01T12:00Z'))).toEqual([]);
  });
  it('keeps all-day deadlines on their source date without blocking the whole day', () => {
    const events = parseCalendar(body(event('DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261103')), 'America/New_York', 'class', new Date('2026-11-01T12:00Z'));
    expect(events[0]).toMatchObject({ start: '2026-11-02T00:00', end: '2026-11-02T00:00', type: 'deadline' });
  });
  it('blocks private networks, local URLs and unsafe schemes', () => {
    for (const ip of ['127.0.0.1', '10.0.0.2', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) expect(publicAddress(ip)).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true);
    for (const url of ['http://example.org/a.ics', 'file:///etc/passwd', 'https://user:pass@example.org/a', 'https://example.org:444/a']) expect(() => publicCalendarUrl(url)).toThrow();
  });
  it('pins the validated DNS address in both Node lookup callback formats', () => {
    const lookup = pinnedLookup('8.8.8.8', 4);
    lookup('example.org', { all: false }, (err, address, family) => { expect(err).toBeNull(); expect(address).toBe('8.8.8.8'); expect(family).toBe(4); });
    lookup('example.org', { all: true }, (err, addresses) => { expect(err).toBeNull(); expect(addresses).toEqual([{ address: '8.8.8.8', family: 4 }]); });
  });
  it('calculates calm week load and overlaps from scheduled minutes', () => {
    const rules = { studyStart: '16:00', studyEnd: '18:00', downtimeStart: '21:00', downtimeEnd: '23:00', maxStudyMin: 120 };
    const events = [{ id: 'a', title: 'Class', type: 'class', start: '2026-11-02T16:00', end: '2026-11-02T17:00', recurDays: [] }, { id: 'b', title: 'Club', type: 'club', start: '2026-11-02T16:30', end: '2026-11-02T17:30', recurDays: [] }];
    const week = weekSummary(events, rules, new Date(2026, 10, 1));
    expect(week).toHaveLength(7); expect(week[0].load).toBe('light'); expect(week[1]).toMatchObject({ minutes: 120, load: 'heavy', clash: true });
  });
  it('returns chronological agenda details with completion, recurrence, sources and conflicts',()=>{
    const rules={studyStart:'16:00',studyEnd:'21:00',downtimeStart:'21:00',downtimeEnd:'23:00',maxStudyMin:120};
    const events=[
      {id:'study',title:'Study',type:'study',start:'2030-01-01T18:00',end:'2030-01-01T19:00',done:true,source:'manual',recurDays:[]},
      {id:'linked',title:'School',type:'class',start:'2030-01-01T17:00',end:'2030-01-01T18:30',readOnly:true,source:'From School',recurDays:[]},
      {id:'weekly',title:'Club',type:'club',start:'2029-12-25T16:00',end:'2029-12-25T17:00',source:'upload',recurDays:[2]},
      {id:'due',title:'Deadline',type:'deadline',start:'2030-01-01T20:00',end:'2030-01-01T20:00',recurDays:[]}
    ];
    const days=weekSummary(events,rules,new Date(2029,11,31));
    expect(days.map(d=>d.date)).toEqual(['2029-12-31','2030-01-01','2030-01-02','2030-01-03','2030-01-04','2030-01-05','2030-01-06']);
    expect(days[0].events).toEqual([]);
    expect(days[1].events.map(e=>e.id)).toEqual(['weekly','linked','study','due']);
    expect(days[1].events[0]).toMatchObject({type:'club',recurring:true,done:false,source:'upload',clash:false});
    expect(days[1].events[1]).toMatchObject({readOnly:true,source:'From School',clash:true});
    expect(days[1].events[2]).toMatchObject({done:true,recurring:false,clash:true});
    expect(days[1].events[3]).toMatchObject({start:'2030-01-01T20:00',end:'2030-01-01T20:00',clash:false});
  });
});
