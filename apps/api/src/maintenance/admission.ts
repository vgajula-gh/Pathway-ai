import {randomUUID} from 'node:crypto';
import type {FastifyInstance, FastifyRequest} from 'fastify';
import type {Prisma} from '@prisma/client';
import {prisma} from '../lib/db.js';
import {HttpError} from '../lib/errors.js';
import {requireOwner} from '../lib/owner-auth.js';
import {maintenanceEnabled} from './target.js';

export const markerKey = 'pilot-reset:maintenance';
export const activityPrefix = 'pilot-reset:activity:';
export const validationKey = 'pilot-reset:validation';
export const receiptKey = (operationId: string) => `pilot-reset:receipt:${operationId}`;
export const minimumDrainMs = 5 * 60_000;
export class MaintenanceActive extends HttpError {
  constructor() { super(503, 'Pathway is temporarily in owner-managed maintenance. Your data has not been changed by this request.'); }
}

// Updating this one row serializes admission and maintenance transitions across
// replicas. The transaction commits BEFORE any application/network work begins.
export async function gated<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(async tx => {
    await tx.jobLease.upsert({
      where: {key: 'pilot-reset:admission-gate'},
      create: {key: 'pilot-reset:admission-gate', expiresAt: new Date(0)},
      update: {expiresAt: new Date(0)},
    });
    return fn(tx);
    }, {isolationLevel: 'Serializable', maxWait: 10_000, timeout: 120_000}); }
    catch (e) {
      // These callbacks contain database work only. Retry rolled-back
      // serialization conflicts, never a network/provider operation.
      if ((e as {code?: string}).code !== 'P2034' || attempt >= 4) throw e;
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

export async function beginActivity(kind: 'request' | 'job', validationOperation?: string) {
  if (!maintenanceEnabled()) return async () => {};
  const key = activityPrefix + randomUUID();
  await gated(async tx => {
    const marker = await tx.jobLease.findUnique({where: {key: markerKey}});
    if (marker && marker.owner !== validationOperation) throw new MaintenanceActive();
    if (validationOperation && (!marker || marker.owner !== validationOperation ||
      !await tx.jobLease.findUnique({where: {key: validationKey}}))) throw new MaintenanceActive();
    await tx.jobLease.create({data: {key, owner: kind, expiresAt: new Date(Date.now() + 300_000)}});
  });
  // Never treat an expired activity as proof that work stopped. A crashed
  // process leaves a blocker requiring investigation, not an automatic reset.
  return async () => { await prisma.jobLease.deleteMany({where: {key}}); };
}

export async function backgroundActivity<T>(fn: () => Promise<T>): Promise<T | undefined> {
  let release: () => Promise<void>;
  try { release = await beginActivity('job'); }
  catch (e) { if (e instanceof MaintenanceActive) return; throw e; }
  try { return await fn(); } finally { await release(); }
}

function validationOperation(req: FastifyRequest) {
  const operation = req.headers['x-pilot-reset-validation'];
  if (operation === undefined) return;
  requireOwner(req);
  const path = req.url.split('?')[0];
  const allowed = req.method === 'POST' && path === '/api/students' ||
    req.method === 'DELETE' && path === '/api/me' ||
    req.method === 'GET' && ['/api/auth/session', '/api/today', '/api/news', '/api/opportunities'].includes(path);
  if (!allowed || typeof operation !== 'string') throw new MaintenanceActive();
  return operation;
}

export function installMaintenanceAdmission(app: FastifyInstance) {
  const releases = new WeakMap<FastifyRequest, () => Promise<void>>();
  app.addHook('onRequest', async req => {
    const path = req.url.split('?')[0];
    if (req.method === 'OPTIONS' || path === '/api/health' ||
      path.startsWith('/internal/maintenance/pilot-reset') ||
      !path.startsWith('/api/') && !path.startsWith('/internal/')) return;
    releases.set(req, await beginActivity('request', validationOperation(req)));
  });
  app.addHook('onResponse', async req => {
    const release = releases.get(req);
    if (release) { releases.delete(req); await release(); }
  });
}
