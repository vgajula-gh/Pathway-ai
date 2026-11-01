import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { loadContext } from './context.js';
import { applicationsFor } from './applications.js';
import { chooseNudge, nudgeAllowed } from '../domain/nudges.js';
import { expand } from '../domain/schedule.js';
import { addDays, fmtLocal, sod, dkey, wallNow } from '../domain/time.js';
import { pushConfig, sendPush } from './push.js';
export async function deliverNudge(studentId: string, test = false, instant = new Date()) {
  if (!pushConfig().configured) return { status: 'not-configured', accepted: 0 };
  const { student, events, rules, goals } = await loadContext(studentId);
  const settings = await prisma.notificationSettings.findUnique({ where: { studentId } });
  const now = wallNow(student.timezone, instant), date = dkey(now);
  if (!settings || !nudgeAllowed(settings, events, now, instant, test)) return { status: 'paused-or-quiet', accepted: 0 };
  const subscriptions = await prisma.pushSubscription.findMany({ where: { studentId } });
  if (!subscriptions.length) return { status: 'no-subscription', accepted: 0 };
  const applications = await applicationsFor(studentId, date), pending = await prisma.agentAction.count({ where: { studentId, status: 'AWAITING_APPROVAL', expiresAt: { gt: instant } } });
  const message = chooseNudge({ applications, events, rules, pending, goals: goals.filter(g => g.status === 'active'), now }) || (test ? { title: 'Pathway notifications', body: 'Your test nudge is ready. You can turn notifications off in You.', tab: 'today' } : null);
  if (!message) return { status: 'nothing-to-nudge', accepted: 0 };
  // Reserve before external delivery. Never retry an uncertain/failed send: this
  // intentionally favors at-most-once over duplicate notifications after a crash.
  try { await prisma.nudgeDelivery.create({ data: { studentId, date } }); }
  catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { status: 'already-sent-today', accepted: 0 }; throw e; }
  let accepted = 0;
  for (const sub of subscriptions) {
    // Respect a concurrent opt-out/pause before contacting each push service.
    const latest = await prisma.notificationSettings.findUnique({ where: { studentId } });
    if (!latest || !nudgeAllowed(latest, events, now, instant, test)) break;
    try { await sendPush(sub.encrypted, { ...message, timezone: student.timezone, date, classes: expand(events, sod(now), addDays(sod(now), 1)).filter(e => e.type === 'class').map(e => ({ start: fmtLocal(e.s), end: fmtLocal(e.e) })), url: `/?tab=${message.tab}`, tag: `pathway-${date}` }); accepted++; }
    catch (e) { if ([404, 410].includes(Number((e as { statusCode?: number }).statusCode))) await prisma.pushSubscription.deleteMany({ where: { id: sub.id } }); }
  }
  await prisma.nudgeDelivery.update({ where: { studentId_date: { studentId, date } }, data: { status: accepted ? 'accepted' : 'not-delivered', accepted } });
  await prisma.auditEvent.create({ data: { studentId, actor: 'system', event: test ? 'Test nudge requested' : 'Daily nudge processed', record: accepted ? 'Accepted by notification service; device delivery is not guaranteed' : 'Not delivered; no automatic retry' } });
  return { status: accepted ? 'accepted' : 'not-delivered', accepted };
}
let running = false;
export async function deliverDueNudges() {
  if (running || !pushConfig().configured) return;
  running = true;
  try {
    const settings = await prisma.notificationSettings.findMany({ where: { enabled: true, OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }] }, select: { studentId: true } });
    for (const s of settings) { try { await deliverNudge(s.studentId); } catch { /* One unavailable profile must not stop other students. */ } }
  } finally { running = false; }
}
