import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
const remote = vi.hoisted(() => vi.fn());
const sent = vi.hoisted(() => vi.fn());
const newsRemote=vi.hoisted(()=>vi.fn());
vi.mock('../src/lib/news-fetch.js',()=>({fetchNewsFeed:newsRemote}));
vi.mock('../src/lib/push.js', async () => ({ ...await vi.importActual('../src/lib/push.js'), sendPush: sent }));
const vapid = webpush.generateVAPIDKeys();
vi.mock('../src/lib/calendar-fetch.js', async () => ({ ...await vi.importActual('../src/lib/calendar-fetch.js'), fetchCalendar: remote }));
const dir = mkdtempSync(join(tmpdir(), 'pathway-features-')), url = `file:${dir}/test.db`;
const db = new PrismaClient({ datasourceUrl: url + '?connection_limit=1' });
vi.mock('../src/lib/db.js', () => ({ get prisma() { return db; }, j: (value: string, fallback: unknown) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } } }));
import { buildApp } from '../src/app.js';
import { env } from '../src/lib/env.js';
const originalCodes = env.accessCodes;
let studentId = '';
const headers = () => ({ 'x-student-id': studentId });
export { db, headers };
beforeAll(async () => {
  writeFileSync(join(dir, 'test.db'), '');
  // Apply the entire versioned SQLite history, not db push.
  await promisify(execFile)(process.execPath, ['../../node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: url } });
}, 30000);
beforeEach(async () => {
  remote.mockReset(); sent.mockReset(); sent.mockResolvedValue({ statusCode: 201 });
  newsRemote.mockReset();
  vi.stubEnv('VAPID_PUBLIC_KEY', vapid.publicKey); vi.stubEnv('VAPID_PRIVATE_KEY', vapid.privateKey); vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.org');
  env.accessCodes = []; await db.student.deleteMany();
  const s = await db.student.create({ data: { name: 'Test', grade: 10, availability: { create: {} } } }); studentId = s.id;
  await db.opportunity.upsert({ where: { id: 'test' }, update: {}, create: { id: 'test', name: 'Test opportunity', organizer: 'Test', category: 'STEM', url: 'https://example.org', gradeMin: 9, gradeMax: 12, format: 'Virtual', cost: 'Free', commitment: 'Low', skills: '[]', tags: '[]', checks: '["Check eligibility"]' } });
});
afterAll(async () => { vi.unstubAllEnvs(); env.accessCodes = originalCodes; await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
it('returns uncached student-local remaining time without charging AI or mixing students',async()=>{
  const app=await buildApp();app.log.level='silent';
  try {
    await db.student.update({where:{id:studentId},data:{timezone:'America/New_York'}});
    await db.event.createMany({data:[
      {studentId,title:'Study',type:'study',start:'2030-01-07T18:00',end:'2030-01-07T19:00',done:true},
      {studentId,title:'Club',type:'club',start:'2030-01-07T20:30',end:'2030-01-07T21:00'},
      {studentId,title:'Evening event',type:'personal',start:'2030-01-07T21:30',end:'2030-01-07T22:30'}
    ]});
    const other=await db.student.create({data:{name:'Other',grade:10}});
    await db.event.create({data:{studentId:other.id,title:'Not mine',type:'study',start:'2030-01-07T16:00',end:'2030-01-07T23:00'}});
    const usage=await db.aIUsage.count();
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2030-01-08T01:00:00Z'));
    const res=await app.inject({url:'/api/today',headers:headers()});
    expect(res.statusCode).toBe(200);expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({date:'2030-01-07',metrics:{
      focus:{label:'Study planned',minutes:60,pct:.5},
      freeTime:{label:'Free time left',minutes:30,windowRemaining:60,downtime:60,downtimeRemaining:120,downtimeBusy:60}
    }});
    vi.setSystemTime(new Date('2030-01-08T02:00:00Z'));
    const later=(await app.inject({url:'/api/today',headers:headers()})).json();
    expect(later.metrics.freeTime).toMatchObject({minutes:0,pct:0,status:'Study window ended',downtime:60});
    expect(await db.aIUsage.count()).toBe(usage);
  } finally {vi.useRealTimers();await app.close();}
});
it('serves Monday–Sunday agenda navigation in the student timezone and shares completion with Today',async()=>{
  const app=await buildApp();app.log.level='silent';
  try {
    await db.student.update({where:{id:studentId},data:{timezone:'America/New_York'}});
    const e=await db.event.create({data:{studentId,title:'Sunday study',type:'study',start:'2030-01-06T18:00',end:'2030-01-06T19:00'}});
    const other=await db.student.create({data:{name:'Other student',grade:10}});
    await db.event.create({data:{studentId:other.id,title:'Private event',type:'study',start:e.start,end:e.end}});
    const usage=await db.aIUsage.count();
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2030-01-07T01:00:00Z'));
    const res=await app.inject({url:'/api/week?weekOffset=0',headers:headers()});
    expect(res.statusCode).toBe(200);expect(res.headers['cache-control']).toBe('no-store');
    const days=res.json();expect(days).toHaveLength(7);
    expect(days[0].date).toBe('2029-12-31');expect(days[6].date).toBe('2030-01-06');
    expect(days.flatMap((d:any)=>d.events)).toHaveLength(1);
    expect(days[6].events[0]).toMatchObject({id:e.id,type:'study',done:false,recurring:false,source:'manual',readOnly:false});
    expect((await app.inject({url:'/api/week?weekOffset=-1',headers:headers()})).json()[0].date).toBe('2029-12-24');
    expect((await app.inject({url:'/api/week?weekOffset=1',headers:headers()})).json()[0].date).toBe('2030-01-07');
    // Existing rolling-date consumers keep their original API behavior.
    expect((await app.inject({url:'/api/week?from=2030-01-04',headers:headers()})).json()[0].date).toBe('2030-01-04');
    expect((await app.inject({url:'/api/week',headers:headers()})).json()[0].date).toBe('2030-01-06');
    expect((await app.inject({method:'PATCH',url:'/api/events/'+e.id,headers:headers(),payload:{done:true}})).statusCode).toBe(200);
    const today=(await app.inject({url:'/api/today',headers:headers()})).json();
    const updated=(await app.inject({url:'/api/week?weekOffset=0',headers:headers()})).json();
    expect(updated[6].events).toEqual(today.timeline);expect(today.timeline[0].done).toBe(true);
    expect(await db.aIUsage.count()).toBe(usage);
  } finally {vi.useRealTimers();await app.close();}
});
it('rejects invalid or ambiguous week navigation and requires student authentication',async()=>{
  const app=await buildApp();app.log.level='silent';
  try {
    for(const query of ['weekOffset=no','weekOffset=1.5','weekOffset=5201','weekOffset=-5201','from=2030-02-31','from=2030-01-01&weekOffset=0']){
      expect((await app.inject({url:'/api/week?'+query,headers:headers()})).statusCode).toBe(422);
    }
    expect((await app.inject({url:'/api/week?weekOffset=0'})).statusCode).toBe(401);
  } finally {await app.close();}
});
it('saves, updates and isolates application metadata and never writes prep events before approval', async () => {
  const app = await buildApp(); app.log.level = 'silent';
  try {
    expect((await app.inject({ method: 'POST', url: '/api/opportunities/test/status', headers: headers(), payload: { status: 'saved' } })).statusCode).toBe(200);
    let list = (await app.inject({ url: '/api/applications', headers: headers() })).json();
    expect(list[0].checklist).toHaveLength(2); expect(list[0].status).toBe('interested'); expect(list[0].deadline).toBeNull();
    const deadline = new Date(); deadline.setDate(deadline.getDate() + 5); const date = deadline.toISOString().slice(0, 10);
    expect((await app.inject({ method: 'PATCH', url: '/api/applications/test', headers: headers(), payload: { deadline: date, status: 'preparing', notes: 'Private note', checklist: [{ title: 'Check', done: true }] } })).statusCode).toBe(200);
    list = (await app.inject({ url: '/api/applications', headers: headers() })).json();
    expect(list[0]).toMatchObject({ status: 'preparing', notes: 'Private note', completed: 1, deadlineSource: 'Added by you · not verified' });
    const proposal = await app.inject({ method: 'POST', url: '/api/applications/test/prep', headers: headers() });
    expect(proposal.statusCode).toBe(200); expect(proposal.json().status).toBe('AWAITING_APPROVAL'); expect(await db.event.count()).toBe(0);
    const other = await db.student.create({ data: { name: 'Other', grade: 10 } });
    expect((await app.inject({ method: 'PATCH', url: '/api/applications/test', headers: { 'x-student-id': other.id }, payload: { notes: 'No' } })).statusCode).toBe(404);
  } finally { await app.close(); }
});

it('syncs encrypted private calendars without duplicates, preserves failures, deletes source removals and blocks edits', async () => {
  const { syncCalendar } = await import('../src/lib/calendars.js');
  const start = new Date(Date.now() + 86400000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const end = new Date(Date.now() + 90000000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  remote.mockResolvedValue(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:one\r\nDTSTAMP:${start}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:Class\r\nEND:VEVENT\r\nEND:VCALENDAR`);
  const app = await buildApp(); app.log.level = 'silent';
  try {
    const created = await app.inject({ method: 'POST', url: '/api/calendars', headers: headers(), payload: { label: 'Google Calendar', url: 'https://example.org/private-secret-token.ics' } });
    expect(created.statusCode).toBe(201); const link = created.json();
    expect(JSON.stringify(link)).not.toContain('private-secret-token'); expect(link.lastSync).toBeTruthy();
    const persisted = await db.calendarLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(persisted.encryptedUrl).not.toContain('https:');
    await syncCalendar(link.id); expect(await db.event.count()).toBe(1);
    const e = await db.event.findFirstOrThrow();
    expect(e.readOnly).toBe(true); expect(e.source).toBe('From Google Calendar');
    expect((await app.inject({ method: 'PATCH', url: `/api/events/${e.id}`, headers: headers(), payload: { done: true } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/api/events/${e.id}`, headers: headers() })).statusCode).toBe(409);
    remote.mockRejectedValue(new Error('secret provider URL')); await syncCalendar(link.id);
    expect(await db.event.count()).toBe(1); expect((await db.calendarLink.findUniqueOrThrow({ where: { id: link.id } })).error).not.toContain('secret provider URL');
    remote.mockResolvedValue('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'); await syncCalendar(link.id);
    expect(await db.event.count()).toBe(0);
    expect((await app.inject({ url: '/api/week', headers: headers() })).json()).toHaveLength(7);
    const exported = (await app.inject({ url: '/api/me/export', headers: headers() })).json(); expect(JSON.stringify(exported)).not.toContain(persisted.encryptedUrl);
  } finally { await app.close(); }
});

it('keeps nudges off by default, encrypts subscriptions and reserves at most one send per student-local day', async () => {
  const { deliverNudge } = await import('../src/lib/nudges.js');
  const app = await buildApp(); app.log.level = 'silent';
  try {
    expect((await app.inject({ url: '/api/notifications', headers: headers() })).json().enabled).toBe(false);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/private-endpoint';
    const payload = { endpoint, keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } };
    expect((await app.inject({ method: 'POST', url: '/api/push/subscribe', headers: headers(), payload })).statusCode).toBe(200);
    expect((await db.pushSubscription.findFirstOrThrow()).encrypted).not.toContain(endpoint);
    await db.goal.create({ data: { studentId, title: 'Learn robotics' } });
    const instant = new Date('2026-11-02T20:00:00Z');
    expect((await deliverNudge(studentId, false, instant)).status).toBe('paused-or-quiet'); expect(sent).not.toHaveBeenCalled();
    expect((await app.inject({ method: 'PATCH', url: '/api/notifications', headers: headers(), payload: { enabled: true, time: '14:00' } })).statusCode).toBe(200);
    const results = await Promise.all(Array.from({ length: 3 }, () => deliverNudge(studentId, false, instant)));
    expect(results.filter(r => r.status === 'accepted')).toHaveLength(1); expect(sent).toHaveBeenCalledOnce(); expect(await db.nudgeDelivery.count()).toBe(1);
    expect(sent.mock.calls[0][1]).toMatchObject({ tab: 'grow', date: '2026-11-02', timezone: 'America/New_York' });
    expect((await deliverNudge(studentId, true, instant)).status).toBe('already-sent-today');
    expect((await app.inject({ method: 'PATCH', url: '/api/notifications', headers: headers(), payload: { time: '22:00' } })).statusCode).toBe(422);
    await app.inject({ method: 'PATCH', url: '/api/notifications', headers: headers(), payload: { pauseWeek: true } });
    expect((await db.notificationSettings.findUniqueOrThrow({ where: { studentId } })).pausedUntil).toBeTruthy();
    await app.inject({ method: 'POST', url: '/api/push/unsubscribe', headers: headers(), payload: { endpoint } });
    expect(await db.pushSubscription.count()).toBe(0); expect((await db.notificationSettings.findUniqueOrThrow({ where: { studentId } })).enabled).toBe(false);
  } finally { await app.close(); }
});
it('keeps failed/uncertain sends reserved and removes expired subscriptions without retrying', async () => {
  const { deliverNudge } = await import('../src/lib/nudges.js');
  const { encryptSubscription } = await import('../src/lib/push.js');
  await db.notificationSettings.create({ data: { studentId, enabled: true, time: '14:00' } });
  await db.goal.create({ data: { studentId, title: 'Learn' } });
  await db.pushSubscription.create({ data: { studentId, endpointHash: 'test-hash', encrypted: encryptSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'a', auth: 'b' } }) } });
  sent.mockRejectedValue({ statusCode: 410 });
  const now = new Date('2026-11-02T20:00:00Z');
  expect((await deliverNudge(studentId, false, now)).status).toBe('not-delivered');
  expect(await db.pushSubscription.count()).toBe(0); expect(await db.nudgeDelivery.count()).toBe(1); expect(sent).toHaveBeenCalledOnce();
  await deliverNudge(studentId, false, now); expect(sent).toHaveBeenCalledOnce();
});

it('keeps phrase-authenticated access to the student features and removes this device push on logout', async () => {
  const app = await buildApp(); app.log.level = 'silent';
  try {
    const phrase = 'forest comet river bicycle';
    const registered = await app.inject({ method: 'POST', url: '/api/students', payload: { name: 'Signed in', grade: 10, credentials: { phrase, confirmPhrase: phrase } } });
    expect(registered.statusCode).toBe(201);
    const signedHeaders = { cookie: String(registered.headers['set-cookie']).split(';')[0] };
    expect((await app.inject({ method: 'POST', url: '/api/opportunities/test/status', headers: signedHeaders, payload: { status: 'saved' } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/applications', headers: signedHeaders })).json()[0].name).toBe('Test opportunity');
    expect((await app.inject({ url: '/api/calendars', headers: signedHeaders })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/week', headers: signedHeaders })).json()).toHaveLength(7);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/signed-in-device';
    const payload = { endpoint, keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } };
    expect((await app.inject({ method: 'POST', url: '/api/push/subscribe', headers: signedHeaders, payload })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: '/api/notifications', headers: signedHeaders, payload: { enabled: true } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: signedHeaders, payload: { endpoint } })).statusCode).toBe(204);
    expect((await app.inject({ url: '/api/auth/session', headers: signedHeaders })).json().student).toBeNull();
    expect(await db.pushSubscription.count({ where: { studentId: registered.json().id } })).toBe(0);
    expect((await db.notificationSettings.findUniqueOrThrow({ where: { studentId: registered.json().id } })).enabled).toBe(false);
  } finally { await app.close(); }
});

it('deletes only the signed-in student event, audits it and updates both schedule views',async()=>{
  const app=await buildApp();app.log.level='silent';
  try {
    const date='2030-01-07';
    const own=await db.event.create({data:{studentId,title:'Study',type:'study',start:date+'T18:00',end:date+'T19:00'}});
    const other=await db.student.create({data:{name:'Other',grade:10}});
    const theirs=await db.event.create({data:{studentId:other.id,title:'Private',type:'study',start:own.start,end:own.end}});
    expect((await app.inject({method:'DELETE',url:'/api/events/'+theirs.id,headers:headers()})).statusCode).toBe(404);
    expect((await app.inject({method:'DELETE',url:'/api/events/'+own.id,headers:headers()})).statusCode).toBe(204);
    expect(await db.event.findUnique({where:{id:own.id}})).toBeNull();expect(await db.event.findUnique({where:{id:theirs.id}})).not.toBeNull();
    expect(await db.auditEvent.findFirst({where:{studentId,event:'Deleted event',record:'Study'}})).not.toBeNull();
    const days=(await app.inject({url:'/api/week?from='+date,headers:headers()})).json();expect(days.flatMap((d:any)=>d.events)).toEqual([]);
    const series=await db.event.create({data:{studentId,title:'Recurring class',type:'class',start:date+'T16:00',end:date+'T17:00',recurDays:'[1,3]'}});
    expect((await app.inject({method:'DELETE',url:'/api/events/'+series.id,headers:headers()})).statusCode).toBe(204);
    expect((await app.inject({url:'/api/week?from='+date,headers:headers()})).json().flatMap((d:any)=>d.events)).toEqual([]);
  } finally {await app.close();}
});
it('serves validated word practice without AI calls or writes',async()=>{
  const app=await buildApp();app.log.level='silent';
  try {
    const before=await db.aIUsage.count(),audit=await db.auditEvent.count();
    const daily=await app.inject({url:'/api/words',headers:headers()});expect(daily.statusCode).toBe(200);expect(daily.headers['cache-control']).toBe('no-store');
    const next=(await app.inject({url:'/api/words?offset=1',headers:headers()})).json();
    expect(next.word.word).not.toBe(daily.json().word.word);expect(next.total).toBe(36);
    expect((await app.inject({url:'/api/today',headers:headers()})).json().word).toEqual(daily.json().word);
    for(const offset of ['-1','1.5','no','100001'])expect((await app.inject({url:'/api/words?offset='+offset,headers:headers()})).statusCode).toBe(422);
    expect((await app.inject({url:'/api/words'})).statusCode).toBe(401);
    expect(await db.aIUsage.count()).toBe(before);expect(await db.auditEvent.count()).toBe(audit);
  } finally {await app.close();}
});
it('refreshes public publisher feeds explicitly, shares the cache and preserves stories on failure',async()=>{
  const app=await buildApp();app.log.level='silent';const originalDemo=env.demoMode;env.demoMode=false;
  try {
    await db.newsStory.deleteMany();await db.jobLease.deleteMany({where:{key:{startsWith:'news-feed:'}}});
    await db.student.update({where:{id:studentId},data:{interests:'["Space"]'}});
    await db.newsStory.create({data:{id:'sample-news',topic:'Space',headline:'Sample',source:'Sample',url:'https://www.nasa.gov/sample',publishedAt:new Date().toISOString().slice(0,10),isSample:true}});
    const usage=await db.aIUsage.count();
    expect((await app.inject({url:'/api/news',headers:headers()})).json().top).toBeNull();expect(newsRemote).not.toHaveBeenCalled();
    newsRemote.mockResolvedValue(`<rss><channel><item><title>Actual publisher title</title><link>https://www.nasa.gov/article/test-live</link><description>Actual publisher description</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
    const responses=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:'/api/news/refresh',headers:headers()})));
    expect(newsRemote).toHaveBeenCalledOnce();expect(responses.every(r=>r.statusCode===200)).toBe(true);
    const loaded=(await app.inject({url:'/api/news',headers:headers()})).json();expect(loaded.top.headline).toBe('Actual publisher title');expect(loaded.stories).toHaveLength(1);
    expect(await db.newsStory.count({where:{isSample:false}})).toBe(1);
    const cached=(await app.inject({method:'POST',url:'/api/news/refresh',headers:headers()})).json();expect(cached.refresh.status).toBe('cached');expect(newsRemote).toHaveBeenCalledOnce();
    await db.jobLease.deleteMany({where:{key:{startsWith:'news-feed:'}}});newsRemote.mockRejectedValue(new Error('Publisher offline'));
    const failed=(await app.inject({method:'POST',url:'/api/news/refresh',headers:headers()})).json();expect(failed.refresh.status).toBe('unavailable');expect(failed.refresh.feeds[0].reason).toBe('source_unavailable');expect(failed.top).toEqual(loaded.top);
    await db.jobLease.deleteMany({where:{key:{startsWith:'news-feed:'}}});
    await db.student.update({where:{id:studentId},data:{settings:JSON.stringify({newsTopics:['Space','Science']})}});
    newsRemote.mockImplementation(async(feed:any)=>{if(feed.topic!=='Space')throw new Error('Offline');return `<rss><item><title>Another public article</title><link>https://www.nasa.gov/article/another</link><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`;});
    const partial=(await app.inject({method:'POST',url:'/api/news/refresh',headers:headers()})).json();expect(partial.refresh.status).toBe('partial');expect(partial.stories.length).toBeGreaterThan(0);
    expect((await app.inject({method:'POST',url:'/api/news/refresh'})).statusCode).toBe(401);
    expect(await db.aIUsage.count()).toBe(usage);
  } finally {env.demoMode=originalDemo;await app.close();}
});
