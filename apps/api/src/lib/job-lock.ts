import {randomUUID} from 'node:crypto';
import {prisma} from './db.js';
export async function withJobLock<T>(key: string, fn: () => Promise<T>, now = new Date()) {
  const owner = randomUUID();
  await prisma.jobLease.upsert({ where: { key }, create: { key, expiresAt: new Date(0) }, update: {} });
  const claim = await prisma.jobLease.updateMany({
    where: { key, expiresAt: { lte: now } },
    data: { owner, expiresAt: new Date(+now + 300000) },
  });
  if (!claim.count) return { skipped: true as const };
  const heartbeat = setInterval(() => {
    void prisma.jobLease
      .updateMany({ where: { key, owner }, data: { expiresAt: new Date(Date.now() + 300000) } })
      .catch(() => {});
  }, 30000);
  heartbeat.unref();
  try {
    return { skipped: false as const, result: await fn() };
  } finally {
    clearInterval(heartbeat);
    await prisma.jobLease.updateMany({ where: { key, owner }, data: { expiresAt: new Date(0), owner: '' } });
  }
}
