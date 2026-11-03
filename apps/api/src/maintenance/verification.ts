import {randomBytes} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {prisma} from '../lib/db.js';
import {env} from '../lib/env.js';
import {HttpError} from '../lib/errors.js';
import {gated, markerKey, receiptKey, validationKey} from './admission.js';
import {librarySnapshot} from './pilot-reset.js';
import {productionHost} from './target.js';
import {monthlySearchAllowance} from '../discovery/monthly-allowance.js';

// Exercise NORMAL registration, cookie authentication and screen-data handlers.
// No synthetic authentication bypass, provider request, or library cleanup.
export async function verifyRegistration(app: FastifyInstance, operationId: string, authorization: string) {
  await gated(async tx => {
    const marker = await tx.jobLease.findUnique({where: {key: markerKey}});
    const receipt = await tx.jobLease.findUnique({where: {key: receiptKey(operationId)}});
    if (!marker || marker.owner !== operationId || !receipt || await tx.student.count())
      throw new HttpError(409, 'Verification requires the completed reset, maintenance, and zero student profiles.');
    if (!env.accessCodes[0]) throw new HttpError(503, 'The existing production invitation configuration must be available for registration verification.');
    if (await tx.jobLease.findUnique({where: {key: validationKey}})) throw new HttpError(409, 'Another verification is active. Investigate stale validation markers instead of deleting them blindly.');
    await tx.jobLease.create({data: {key: validationKey, owner: operationId, expiresAt: new Date()}});
  });
  let studentId: string | undefined;
  const checks: {path: string; status: number; studentPresent?: boolean}[] = [];
  let requestFailure = false, cleanupFailure = false;
  try {
    const phrase = randomBytes(32).toString('hex');
    const headers = {host: productionHost, authorization, 'x-pilot-reset-validation': operationId, 'x-access-code': env.accessCodes[0]};
    const registration = await app.inject({method: 'POST', url: '/api/students', headers, payload: {
      name: 'Pilot reset validation', grade: 10, interests: [], aiConsent: false, sampleWeek: false,
      credentials: {phrase, confirmPhrase: phrase},
    }});
    checks.push({path: '/api/students', status: registration.statusCode});
    if (registration.statusCode !== 201) throw new Error('registration');
    studentId = registration.json().id;
    if (!studentId) throw new Error('registration identity');
    const cookie = String(registration.headers['set-cookie'] || '').split(';')[0];
    if (!cookie.startsWith('pathway_session=')) throw new Error('session cookie');
    for (const path of ['/api/auth/session', '/api/today', '/api/news', '/api/opportunities']) {
      const response = await app.inject({method: 'GET', url: path, headers: {...headers, cookie}});
      const studentPresent = path === '/api/auth/session' ? response.json().student?.id === studentId : undefined;
      checks.push({path, status: response.statusCode, ...(studentPresent === undefined ? {} : {studentPresent})});
      if (response.statusCode !== 200 || studentPresent === false) throw new Error('screen API');
    }
  } catch { requestFailure = true; }
  finally {
    try {
      await prisma.$transaction(async tx => {
        if (studentId) {
          await tx.aIUsage.deleteMany({where: {key: {startsWith: 'day:', endsWith: `:${studentId}`}}});
          await tx.student.deleteMany({where: {id: studentId}});
        }
        // No outside registration is admitted during this verification.
        if (!await tx.student.count()) await tx.loginAttempt.deleteMany();
      });
    } catch { cleanupFailure = true; }
  }
  // Do not remove the validation marker if cleanup failed: fail closed.
  return gated(async tx => {
    const row = await tx.jobLease.findUniqueOrThrow({where: {key: receiptKey(operationId)}});
    const receipt = JSON.parse(row.owner);
    const students = await tx.student.count(), library = await librarySnapshot(tx);
    const usage = await tx.discoveryUsage.findUnique({where: {month: receipt.month}});
    const ai = await tx.aIUsage.findUnique({where: {key: `month:${receipt.month}`}});
    const libraryUnchanged = JSON.stringify(library) === JSON.stringify(receipt.library);
    const allowancesReset = usage?.runs === 0 && usage?.rechecks === 0 && ai?.count === 0;
    const monthlyAllowance = await monthlySearchAllowance(tx);
    const verification = {
      passed: !requestFailure && !cleanupFailure && students === 0 && libraryUnchanged && allowancesReset && !monthlyAllowance.limited,
      checkedAt: new Date().toISOString(), checks, remainingStudents: students,
      libraryUnchanged, allowancesReset, cleanupSucceeded: !cleanupFailure,
      monthlyAllowance,
      signedInVisualUIVerified: false,
      note: 'Normal registration and authenticated Today/Explore APIs checked. This is not a rendered browser test. The disposable profile is removed.',
    };
    receipt.verification = verification;
    await tx.jobLease.update({where: {key: row.key}, data: {owner: JSON.stringify(receipt)}});
    if (!cleanupFailure) await tx.jobLease.deleteMany({where: {key: validationKey, owner: operationId}});
    return verification;
  });
}
