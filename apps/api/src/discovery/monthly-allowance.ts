import type { Prisma } from '@prisma/client';
import { limit } from '../lib/ai-limits.js';
import { setting } from './config.js';

export type MonthlyLimitReason = 'discovery_monthly_limit' | 'ai_monthly_limit';
export type MonthlySearchAllowance = {
  limited: boolean;
  reasons: MonthlyLimitReason[];
  resetsAt: string;
};

// Read-only preflight. The worker's atomic reservations still authorize spending.
export async function monthlySearchAllowance(
  db: Pick<Prisma.TransactionClient, 'discoveryUsage' | 'aIUsage'>,
  now = new Date(),
): Promise<MonthlySearchAllowance> {
  const month = now.toISOString().slice(0, 7);
  const [discovery, overall] = await Promise.all([
    db.discoveryUsage.findUnique({ where: { month }, select: { runs: true } }),
    db.aIUsage.findUnique({ where: { key: 'month:' + month }, select: { count: true } }),
  ]);
  const reasons: MonthlyLimitReason[] = [];
  if ((discovery?.runs || 0) >= setting('DISCOVERY_MONTHLY_BUDGET', 10, 10000))
    reasons.push('discovery_monthly_limit');
  if ((overall?.count || 0) >= limit(process.env.AI_MONTHLY_LIMIT, 1000))
    reasons.push('ai_monthly_limit');
  return {
    limited: reasons.length > 0,
    reasons,
    resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
  };
}

export function monthlyLimitMessage(allowance: MonthlySearchAllowance) {
  return allowance.reasons.length > 1
    ? 'The shared monthly search and AI allowances have been reached.'
    : allowance.reasons.includes('ai_monthly_limit')
      ? 'The shared monthly AI allowance has been reached.'
      : 'The shared monthly search allowance has been reached.';
}
