import {createHash, randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {HttpError} from '../lib/errors.js';
import {prisma} from '../lib/db.js';
import {gated, markerKey, activityPrefix, validationKey, receiptKey, minimumDrainMs} from './admission.js';
import {productionHost} from './target.js';
import {monthlySearchAllowance} from '../discovery/monthly-allowance.js';
import {setting} from '../discovery/config.js';
import {limit} from '../lib/ai-limits.js';

type DB = Prisma.TransactionClient;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = (rows: {id: string}[]) => ({count: rows.length, idsHash: digest(rows.map(r => r.id))});
export async function librarySnapshot(db: DB) {
  const [opportunities, pages, chunks, candidates, runs, finishedRuns] = await Promise.all([
    db.opportunity.findMany({select: {id: true}, orderBy: {id: 'asc'}}),
    db.sourcePage.findMany({select: {id: true}, orderBy: {id: 'asc'}}),
    db.knowledgeChunk.findMany({select: {id: true}, orderBy: {id: 'asc'}}),
    db.researchCandidate.findMany({select: {id: true}, orderBy: {id: 'asc'}}),
    db.discoveryRun.findMany({select: {id: true}, orderBy: {id: 'asc'}}),
    db.discoveryRun.findMany({where: {finishedAt: {not: null}}, select: {id: true}, orderBy: {id: 'asc'}}),
  ]);
  return {
    Opportunity: identity(opportunities), SourcePage: identity(pages), KnowledgeChunk: identity(chunks),
    ResearchCandidate: identity(candidates), DiscoveryRun: identity(runs), finishedDiscoveryRun: identity(finishedRuns),
  };
}

export async function blockers(db: DB, now = new Date()) {
  const [activities, expiredActivities, oldWorkerLocks, calendarLeases, validation] = await Promise.all([
    db.jobLease.count({where: {key: {startsWith: activityPrefix}}}),
    db.jobLease.count({where: {key: {startsWith: activityPrefix}, expiresAt: {lte: now}}}),
    db.jobLease.count({where: {expiresAt: {gt: now}, OR: [{key: 'opportunity-jobs'}, {key: {startsWith: 'knowledge:'}}]}}),
    db.calendarLink.count({where: {leaseUntil: {gt: now}}}),
    db.jobLease.count({where: {key: validationKey}}),
  ]);
  return {activities, expiredActivities, oldWorkerLocks, calendarLeases, validation};
}
export async function snapshot(db: DB, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const [students, library, discoveryUsage, monthlyAI, work] = await Promise.all([
    db.student.findMany({select: {id: true}, orderBy: {id: 'asc'}}),
    librarySnapshot(db), db.discoveryUsage.findUnique({where: {month}}),
    db.aIUsage.findUnique({where: {key: `month:${month}`}}), blockers(db, now),
  ]);
  const configuredLimits = {
    discoveryRuns: setting('DISCOVERY_MONTHLY_BUDGET', 10, 10000),
    rechecks: setting('DISCOVERY_RECHECKS_PER_MONTH', 10, 10000),
    monthlyAI: limit(process.env.AI_MONTHLY_LIMIT, 1000),
    dailyAI: limit(process.env.AI_DAILY_LIMIT, 20),
  };
  const values = {month, students: students.length, studentSetHash: digest(students.map(s => s.id)), library, discoveryUsage, monthlyAI: monthlyAI?.count || 0, configuredLimits};
  return {target: {host: productionHost, environment: 'production', provider: 'postgresql'}, ...values, snapshotHash: digest(values), blockers: work, monthlyAllowance: await monthlySearchAllowance(db, now)};
}
export async function status() {
  const marker = await prisma.jobLease.findUnique({where: {key: markerKey}});
  const receipt = marker && await prisma.jobLease.findUnique({where: {key: receiptKey(marker.owner)}});
  return {
    ...await snapshot(prisma),
    maintenance: marker ? {operationId: marker.owner, startedAt: marker.expiresAt.toISOString(), earliestExecuteAt: new Date(+marker.expiresAt + minimumDrainMs).toISOString()} : null,
    receipt: receipt ? JSON.parse(receipt.owner) : null,
  };
}
export function enterMaintenance() {
  return gated(async tx => {
    const existing = await tx.jobLease.findUnique({where: {key: markerKey}});
    const marker = existing || await tx.jobLease.create({data: {key: markerKey, owner: randomUUID(), expiresAt: new Date()}});
    return {operationId: marker.owner, startedAt: marker.expiresAt.toISOString(), minimumDrainMs, note: 'Maintenance stays enabled until an explicit cancel or verified resume. No data has been reset.'};
  });
}
export type ResetInput = {
  operationId: string; snapshotHash: string; month: string; rolloutComplete: true;
  backup: {reference: string; takenAt: string; restoreVerified: true; productionHost: string};
};
export async function executeReset(input: ResetInput) {
  return gated(async tx => {
    const marker = await tx.jobLease.findUnique({where: {key: markerKey}});
    if (!marker || marker.owner !== input.operationId) throw new HttpError(409, 'Enter maintenance and use its operation ID first.');
    const previous = await tx.jobLease.findUnique({where: {key: receiptKey(input.operationId)}});
    if (previous) return JSON.parse(previous.owner);
    const now = new Date(), earliest = +marker.expiresAt + minimumDrainMs;
    const backupTime = Date.parse(input.backup.takenAt);
    if (Date.now() < earliest || !input.rolloutComplete) throw new HttpError(409, 'Wait for the maintenance drain window and confirm the deployment rollout completed.');
    if (!input.backup.restoreVerified || input.backup.productionHost !== productionHost ||
      !input.backup.reference.trim() || !Number.isFinite(backupTime) || backupTime < earliest ||
      backupTime > +now || +now - backupTime > 24 * 3600_000)
      throw new HttpError(409, 'A verified, restorable production backup taken after the drain window is required. Backup attestation is an operator responsibility.');
    const before = await snapshot(tx, now);
    if (before.month !== input.month || before.snapshotHash !== input.snapshotHash) throw new HttpError(409, 'The database snapshot or UTC month changed. Review status again.');
    if (before.blockers.activities || before.blockers.oldWorkerLocks || before.blockers.calendarLeases || before.blockers.validation)
      throw new HttpError(409, 'Activity has not drained. Expired activity records are also blockers; do not clear them without investigating.');
    const students = await tx.student.findMany({select: {id: true}});
    let dailyCountersRemoved = 0;
    for (let i = 0; i < students.length; i += 250) {
      dailyCountersRemoved += (await tx.aIUsage.deleteMany({where: {OR: students.slice(i, i + 250).map(s => ({key: {startsWith: 'day:', endsWith: `:${s.id}`}}))}})).count;
    }
    // Pending work is cancelled only after live handlers/workers have drained.
    // No provider, embedding, reconciliation, expiration, or cleanup function runs.
    const interruptedRuns = (await tx.discoveryRun.updateMany({
      where: {status: 'running', finishedAt: null},
      data: {status: 'interrupted', finishedAt: now, error: 'Stopped for owner-authorized tester pilot reset; recorded usage is preserved.'},
    })).count;
    await tx.discoveryGroup.updateMany({data: {status: 'idle', pendingBuckets: '[]', requestedAt: null, context: '{}', error: ''}});
    await tx.jobLease.updateMany({where: {key: {startsWith: 'knowledge-attempt:'}, owner: 'running'}, data: {owner: 'interrupted'}});
    const removed = {
      sessions: (await tx.authSession.deleteMany()).count,
      searchRequests: (await tx.opportunitySearchRequest.deleteMany()).count,
      chats: (await tx.chatMessage.deleteMany()).count,
      conversations: (await tx.conversation.deleteMany()).count,
      events: (await tx.event.deleteMany()).count,
      calendars: (await tx.calendarLink.deleteMany()).count,
      milestones: (await tx.milestone.deleteMany()).count,
      goals: (await tx.goal.deleteMany()).count,
      applications: (await tx.savedOpportunity.deleteMany()).count,
      picks: (await tx.studentPick.deleteMany()).count,
      feedback: (await tx.opportunityFeedback.deleteMany()).count,
      refreshState: (await tx.pickRefreshState.deleteMany()).count,
      notifications: (await tx.notificationSettings.deleteMany()).count,
      subscriptions: (await tx.pushSubscription.deleteMany()).count,
      nudges: (await tx.nudgeDelivery.deleteMany()).count,
      briefs: (await tx.dailyBrief.deleteMany()).count,
      actions: (await tx.agentAction.deleteMany()).count,
      auditEvents: (await tx.auditEvent.deleteMany()).count,
      portfolio: (await tx.portfolioEntry.deleteMany()).count,
      availability: (await tx.availability.deleteMany()).count,
      loginAttempts: (await tx.loginAttempt.deleteMany()).count,
      students: (await tx.student.deleteMany()).count,
      dailyCounters: dailyCountersRemoved,
    };
    await tx.discoveryUsage.upsert({where: {month: before.month}, create: {month: before.month}, update: {runs: 0, rechecks: 0}});
    await tx.aIUsage.upsert({where: {key: `month:${before.month}`}, create: {key: `month:${before.month}`, count: 0}, update: {count: 0}});
    const library = await librarySnapshot(tx);
    // Interrupting a previously unfinished run legitimately adds a finishedAt.
    const protectedBefore = {...before.library, finishedDiscoveryRun: undefined};
    if (digest({...library, finishedDiscoveryRun: undefined}) !== digest(protectedBefore)) throw new HttpError(409, 'Shared library identity changed; reset rolled back.');
    const report = {
      operationId: input.operationId, executedAt: now.toISOString(), month: before.month,
      backup: input.backup, backupVerification: 'Operator-attested; this app cannot independently inspect platform backups.',
      before, removed, interruptedRuns, library, remainingStudents: await tx.student.count(),
      allowanceCounters: {runs: 0, rechecks: 0, monthlyAI: 0},
      verification: null, maintenanceActive: true,
    };
    // Retain reset counters in an owner-only receipt; spending totals, old months,
    // completed run contents and their usage JSON are never overwritten.
    await tx.jobLease.create({data: {key: receiptKey(input.operationId), owner: JSON.stringify(report), expiresAt: now}});
    return report;
  });
}
export async function leaveMaintenance(operationId: string, cancel = false) {
  return gated(async tx => {
    const marker = await tx.jobLease.findUnique({where: {key: markerKey}});
    if (!marker || marker.owner !== operationId) throw new HttpError(409, 'Maintenance operation does not match.');
    if (await tx.jobLease.findUnique({where: {key: validationKey}})) throw new HttpError(409, 'Registration verification is still active.');
    const receipt = await tx.jobLease.findUnique({where: {key: receiptKey(operationId)}});
    if (cancel ? !!receipt : !receipt || !JSON.parse(receipt.owner).verification?.passed)
      throw new HttpError(409, cancel ? 'An executed reset cannot be cancelled or undone here.' : 'Successful registration verification is required before resuming.');
    if (receipt) {
      const report = JSON.parse(receipt.owner);
      report.maintenanceActive = false;
      report.resumedAt = new Date().toISOString();
      await tx.jobLease.update({where: {key: receipt.key}, data: {owner: JSON.stringify(report)}});
    }
    await tx.jobLease.delete({where: {key: markerKey}});
    return {maintenanceActive: false, cancelled: cancel};
  });
}
