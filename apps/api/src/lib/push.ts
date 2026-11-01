import webpush from 'web-push';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
export const Subscription = z.object({ endpoint: z.string().url().max(4096).refine(value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com' || u.hostname.endsWith('.push.services.mozilla.com') || u.hostname.endsWith('.push.apple.com') || u.hostname.endsWith('.notify.windows.com')); } catch { return false; }
}, 'Use your browser’s notification subscription'), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]+$/).max(150).refine(v => Buffer.from(v, 'base64url').length === 65), auth: z.string().regex(/^[A-Za-z0-9_-]+$/).max(80).refine(v => Buffer.from(v, 'base64url').length === 16) }) });
export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '', privateKey = process.env.VAPID_PRIVATE_KEY || '', subject = process.env.VAPID_SUBJECT || '';
  const configured = Buffer.from(publicKey, 'base64url').length === 65 && Buffer.from(privateKey, 'base64url').length === 32 && /^(mailto:|https:\/\/)/.test(subject);
  return { configured, publicKey: configured ? publicKey : null };
}
export const endpointHash = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');
const key = () => createHash('sha256').update(process.env.VAPID_PRIVATE_KEY || '').digest();
export function encryptSubscription(subscription: z.infer<typeof Subscription>) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv), bytes = Buffer.concat([cipher.update(JSON.stringify(subscription)), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(b => b.toString('base64')).join('.');
}
export async function sendPush(encrypted: string, payload: unknown) {
  const [iv, tag, bytes] = encrypted.split('.').map(v => Buffer.from(v, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag);
  const subscription = JSON.parse(Buffer.concat([decipher.update(bytes), decipher.final()]).toString());
  return webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 600, urgency: 'low', timeout: 10000, vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! } });
}
