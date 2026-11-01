import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireStudent, HttpError } from '../lib/auth.js';
import { Subscription, endpointHash, encryptSubscription, pushConfig } from '../lib/push.js';
import { deliverNudge } from '../lib/nudges.js';
import { audit } from '../lib/audit.js';
const Time = z.string().regex(/^(0[7-9]|1[0-9]|20):[0-5][0-9]$/, 'Choose a time between 7am and 9pm');
export default async function routes(app: FastifyInstance) {
  app.get('/api/notifications', async req => {
    const s = await requireStudent(req), settings = await prisma.notificationSettings.findUnique({ where: { studentId: s.id } });
    return { enabled: settings?.enabled || false, time: settings?.time || '16:00', pausedUntil: settings?.pausedUntil || null, timezone: s.timezone, ...pushConfig(), subscriptions: await prisma.pushSubscription.count({ where: { studentId: s.id } }) };
  });
  app.patch('/api/notifications', async req => {
    const s = await requireStudent(req), b = z.object({ enabled: z.boolean().optional(), time: Time.optional(), pauseWeek: z.boolean().optional() }).parse(req.body);
    if (b.enabled && !pushConfig().configured) throw new HttpError(503, 'Notifications are not configured on this server yet. Everything else is available.');
    if (b.enabled && !await prisma.pushSubscription.count({ where: { studentId: s.id } })) throw new HttpError(422, 'Enable notifications on this device first.');
    const data = { enabled: b.enabled, time: b.time, pausedUntil: b.pauseWeek === undefined ? undefined : b.pauseWeek ? new Date(Date.now() + 7 * 864e5) : null };
    const setting = await prisma.notificationSettings.upsert({ where: { studentId: s.id }, update: data, create: { studentId: s.id, ...data } });
    await audit(s.id, 'student', 'Changed gentle daily nudge settings'); return { enabled: setting.enabled, time: setting.time, pausedUntil: setting.pausedUntil };
  });
  app.post('/api/push/subscribe', async req => {
    const s = await requireStudent(req); if (!pushConfig().configured) throw new HttpError(503, 'Notifications are not configured on this server yet.');
    const b = Subscription.parse(req.body), hash = endpointHash(b.endpoint);
    const existing = await prisma.pushSubscription.findUnique({ where: { endpointHash: hash } });
    if (existing && existing.studentId !== s.id) throw new HttpError(409, 'This device is linked to another profile. Remove its notification subscription first.');
    if (!existing && await prisma.pushSubscription.count({ where: { studentId: s.id } }) >= 10) throw new HttpError(422, 'You can enable notifications on up to ten devices.');
    await prisma.pushSubscription.upsert({ where: { endpointHash: hash }, update: { encrypted: encryptSubscription(b) }, create: { studentId: s.id, endpointHash: hash, encrypted: encryptSubscription(b) } });
    await audit(s.id, 'student', 'Enabled browser notification subscription'); return { ok: true };
  });
  app.post('/api/push/unsubscribe', async req => {
    const s = await requireStudent(req), { endpoint } = z.object({ endpoint: z.string().max(4096) }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { studentId: s.id, endpointHash: endpointHash(endpoint) } });
    if (!await prisma.pushSubscription.count({ where: { studentId: s.id } })) await prisma.notificationSettings.updateMany({ where: { studentId: s.id }, data: { enabled: false } });
    await audit(s.id, 'student', 'Removed browser notification subscription'); return { ok: true };
  });
  app.post('/api/notifications/test', async req => { const s = await requireStudent(req); return deliverNudge(s.id, true); });
}
