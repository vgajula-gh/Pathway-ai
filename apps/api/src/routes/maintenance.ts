import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {requireOwner} from '../lib/owner-auth.js';
import {assertProductionTarget, productionHost} from '../maintenance/target.js';
import {enterMaintenance, executeReset, leaveMaintenance, status, backupWaiverAcknowledgment} from '../maintenance/pilot-reset.js';
import {verifyRegistration} from '../maintenance/verification.js';

const root = '/internal/maintenance/pilot-reset';
const target = z.object({confirmProductionHost: z.literal(productionHost)});
const operation = target.extend({operationId: z.string().uuid()}).strict();
const execute = operation.extend({
  confirmation: z.literal('DELETE ALL PRODUCTION STUDENT DATA'),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  rolloutComplete: z.literal(true),
  backup: z.object({
    reference: z.string().trim().min(1).max(200).refine(v => !/[:/@?\\]/.test(v), 'Use a non-secret backup label, not a URL, path or credential.'),
    takenAt: z.string().datetime(), restoreVerified: z.literal(true), productionHost: z.literal(productionHost),
  }).strict().optional(),
  backupWaiver: z.object({
    acknowledgment: z.literal(backupWaiverAcknowledgment), productionHost: z.literal(productionHost),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (!!value.backup === !!value.backupWaiver)
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['backupWaiver'], message: 'Choose verified backup evidence or explicit acceptance of permanent data loss, never both.'});
});

export default async function maintenance(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    requireOwner(req);
    assertProductionTarget(req);
    reply.header('cache-control', 'no-store');
  });
  app.get(root, async () => status());
  app.post(`${root}/start`, async req => {
    target.strict().parse(req.body); return enterMaintenance();
  });
  app.post(`${root}/execute`, async req => executeReset(execute.parse(req.body)));
  app.post(`${root}/verify`, async (req, reply) => {
    const body = operation.parse(req.body);
    const result = await verifyRegistration(app, body.operationId, req.headers.authorization!);
    return reply.code(result.passed ? 200 : 409).send(result);
  });
  app.post(`${root}/resume`, async req => {
    const body = operation.parse(req.body); return leaveMaintenance(body.operationId);
  });
  app.post(`${root}/cancel`, async req => {
    const body = operation.parse(req.body); return leaveMaintenance(body.operationId, true);
  });
}
