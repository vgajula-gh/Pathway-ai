import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { HttpError } from './auth.js';

export function limit(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('AI limits must be non-negative whole numbers');
  return Number(value);
}
// Background shared catalog work uses the same overall cap, with no student's daily counter.
export async function reserveMonthlyAI(tx:Prisma.TransactionClient,now=new Date()) {
  const max=limit(process.env.AI_MONTHLY_LIMIT,1000),key=`month:${now.toISOString().slice(0,7)}`;
  await tx.aIUsage.upsert({where:{key},create:{key,count:0},update:{}});
  const result=await tx.aIUsage.updateMany({where:{key,count:{lt:max}},data:{count:{increment:1}}});
  if(!result.count)throw new HttpError(429,'Our AI help has reached its monthly limit. It will be back next month. Everything else is still available.');
}
// UTC calendar day/month. One accepted AI feature request = one reservation,
// including provider failures and internal tool rounds/retries. Never refund a call.
export async function reserveAI(studentId: string, now = new Date()) {
  const daily = limit(process.env.AI_DAILY_LIMIT, 20);
  const day = now.toISOString().slice(0, 10);
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$transaction(async tx => {
        await reserveMonthlyAI(tx,now);
        for (const [key, max, message] of [
          [`day:${day}:${studentId}`, daily, 'You’ve reached your AI limit for today. Come back tomorrow for more AI help. Everything else is still available.']
        ] as const) {
          await tx.aIUsage.upsert({ where: { key }, create: { key, count: 0 }, update: {} });
          const result = await tx.aIUsage.updateMany({ where: { key, count: { lt: max } }, data: { count: { increment: 1 } } });
          if (!result.count) throw new HttpError(429, message);
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (e) {
      if (attempt < 4 && e instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002', 'P1008'].includes(e.code)) continue;
      throw e;
    }
  }
}
