import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { prisma } from './db.js';
import { HttpError } from './auth.js';
import { parseCalendar } from '../domain/calendars.js';
import { fetchCalendar, publicCalendarUrl } from './calendar-fetch.js';
import {backgroundActivity} from '../maintenance/admission.js';
const interval = 3 * 3600 * 1000;
function key() {
  const secret = process.env.CALENDAR_SECRET || (process.env.NODE_ENV !== 'production' ? 'local-only-calendar-secret' : '');
  if (secret.length < 24) throw new HttpError(503, 'Calendar linking is not configured yet. Your other features are available.');
  return createHash('sha256').update(secret).digest();
}
export function encryptCalendarUrl(raw: string) {
  const url = publicCalendarUrl(raw), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(url.href), cipher.final()]);
  return { maskedUrl: url.origin + '/••••', encryptedUrl: [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.') };
}
function decrypt(value: string) {
  const [iv, tag, bytes] = value.split('.').map(v => Buffer.from(v, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(bytes), cipher.final()]).toString();
}
export const calendarView = (c: {id: string; label: string; maskedUrl: string; lastSync: Date | null; error: string; eventType: string}) => ({ id: c.id, label: c.label, maskedUrl: c.maskedUrl, lastSync: c.lastSync, error: c.error, eventType: c.eventType });
export async function syncCalendar(id: string, now = new Date()) {
  const leaseUntil = new Date(+now + 120000);
  const claimed = await prisma.calendarLink.updateMany({ where: { id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseUntil, syncAfter: new Date(+now + interval) } });
  if (!claimed.count) return;
  try {
    const link = await prisma.calendarLink.findUnique({ where: { id }, include: { student: true } });
    if (!link) return;
    const raw = await fetchCalendar(decrypt(link.encryptedUrl));
    const events = parseCalendar(raw, link.student.timezone, link.eventType, now);
    await prisma.$transaction(async tx => {
      // Delete/update only this link's mirror. A failure preserves the previous mirror.
      for (const e of events) await tx.event.upsert({ where: { calendarId_importKey: { calendarId: id, importKey: e.importKey } }, update: { ...e, source: `From ${link.label}`, readOnly: true }, create: { ...e, calendarId: id, studentId: link.studentId, source: `From ${link.label}`, readOnly: true } });
      await tx.event.deleteMany({ where: { calendarId: id, importKey: { notIn: events.map(e => e.importKey) } } });
      await tx.calendarLink.update({ where: { id }, data: { lastSync: now, error: '', leaseUntil: null } });
      await tx.auditEvent.create({ data: { studentId: link.studentId, actor: 'system', event: 'Synced read-only calendar', record: link.label } });
    }, { timeout: 30000 });
  } catch {
    // Never store provider error text; it can contain private subscription URLs.
    await prisma.calendarLink.updateMany({ where: { id }, data: { leaseUntil: null, error: 'Could not sync this calendar. Check the private iCal link, sharing settings and network access. Previous events are kept.' } });
  }
}
export async function syncDueCalendars() {
  return backgroundActivity(syncDueCalendarsUnlocked);
}
async function syncDueCalendarsUnlocked() {
  const links = await prisma.calendarLink.findMany({ where: { syncAfter: { lte: new Date() } }, select: { id: true }, take: 20 });
  for (const link of links) await syncCalendar(link.id);
}
