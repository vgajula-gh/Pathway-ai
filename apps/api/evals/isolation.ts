import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

/** Reject remote URLs and arbitrary files before constructing any database client. */
export function isolatedDatabase(root: string | undefined, url: string | undefined, nonce: string | undefined): string {
  if (!root || !url?.startsWith('file:') || !nonce || !basename(root).startsWith('pathway-eval-'))
    throw new Error('Use the eval launcher to create an isolated temporary database.');
  const path = resolve(url.slice(5));
  if (basename(path) !== 'eval.db' || realpathSync(dirname(path)) !== realpathSync(root) ||
      readFileSync(resolve(root, '.eval-nonce'), 'utf8') !== nonce)
    throw new Error('The eval database is not owned by this run.');
  return `file:${path}?connection_limit=1`;
}
