import {parseArgs} from 'node:util';
class OwnerInputError extends Error {}

const {values: a} = parseArgs({options: {
  action: {type: 'string', default: 'status'}, url: {type: 'string'},
  'confirm-production': {type: 'string'}, operation: {type: 'string'},
  snapshot: {type: 'string'}, month: {type: 'string'}, backup: {type: 'string'},
  'backup-taken-at': {type: 'string'}, 'restore-verified': {type: 'boolean'},
  'no-backup': {type: 'boolean'}, 'accept-permanent-loss': {type: 'boolean'},
  'rollout-complete': {type: 'boolean'}, 'confirm-delete-all-students': {type: 'boolean'},
}, strict: true});

async function main() {
  const actions = ['status', 'start', 'execute', 'verify', 'resume', 'cancel'];
  if (!actions.includes(a.action)) throw new OwnerInputError('Choose status, start, execute, verify, resume or cancel.');
  if (!a.url) throw new OwnerInputError('Supply the reviewed production --url explicitly.');
  const url = new URL(a.url);
  if (url.origin !== 'https://pathway-ai.replit.app' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
    throw new OwnerInputError('Only the reviewed production origin https://pathway-ai.replit.app is accepted. Preview and SQLite are not targets.');
  const secret = process.env.JOBS_SECRET;
  if (!secret || secret.length < 32) throw new OwnerInputError('The existing JOBS_SECRET must be present securely in this process. Never put it in a command argument.');
  const body = {confirmProductionHost: a['confirm-production'], operationId: a.operation};
  if (a.action !== 'status' && body.confirmProductionHost !== url.host)
    throw new OwnerInputError('Confirm the production hostname with --confirm-production pathway-ai.replit.app.');
  if (!['status', 'start'].includes(a.action) && !a.operation) throw new OwnerInputError('Supply --operation from the start response.');
  if (a.action === 'execute') {
    if (!a.snapshot || !a.month || !a['rollout-complete'] || !a['confirm-delete-all-students'])
      throw new OwnerInputError('Execution requires snapshot, UTC month, rollout confirmation and explicit deletion confirmation. Read docs/PILOT-RESET.md.');
    if (a['no-backup']) {
      if (!a['accept-permanent-loss'] || a.backup || a['backup-taken-at'] || a['restore-verified'])
        throw new OwnerInputError('No-backup execution requires --accept-permanent-loss and cannot include backup evidence.');
      body.backupWaiver = {
        acknowledgment: 'I ACCEPT PERMANENT LOSS OF ALL PRODUCTION STUDENT DATA WITHOUT A BACKUP', productionHost: url.host,
      };
    } else {
      if (!a.backup || !a['backup-taken-at'] || !a['restore-verified'] || a['accept-permanent-loss'])
        throw new OwnerInputError('Supply verified backup evidence, or explicitly use --no-backup --accept-permanent-loss.');
      body.backup = {reference: a.backup, takenAt: a['backup-taken-at'], restoreVerified: true, productionHost: url.host};
    }
    Object.assign(body, {
      confirmation: 'DELETE ALL PRODUCTION STUDENT DATA',
      snapshotHash: a.snapshot, month: a.month, rolloutComplete: true,
    });
  }
  if (a.action === 'start') delete body.operationId;
  const response = await fetch(`${url.origin}/internal/maintenance/pilot-reset${a.action === 'status' ? '' : '/' + a.action}`, {
    method: a.action === 'status' ? 'GET' : 'POST',
    headers: {authorization: `Bearer ${secret}`, 'content-type': 'application/json'},
    ...(a.action === 'status' ? {} : {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(130_000), redirect: 'error',
  });
  if (!(response.headers.get('content-type') || '').includes('application/json'))
    throw new OwnerInputError(`The production server returned non-JSON HTTP ${response.status}. No retry was attempted.`);
  const report = await response.json();
  console.log(JSON.stringify({httpStatus: response.status, ...report}, null, 2));
  if (!response.ok) process.exitCode = 1;
}
main().catch(error => {
  // Never print request objects, headers, response bodies from a proxy, or keys.
  console.error(error instanceof OwnerInputError ? error.message : 'Pilot maintenance did not complete. Check arguments and the production owner report. No automatic retry was attempted.');
  process.exitCode = 1;
});
