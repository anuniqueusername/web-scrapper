/**
 * lib/spawn-facebook-scraper.js
 *
 * Server-only utility that spawns facebook-worker-runner.js as a detached
 * child process.  Isolating the spawn call here keeps child_process usage out
 * of API route files directly, and makes it easy to find and audit.
 *
 * NEVER import this file from Client Components or pages.
 */

import 'server-only';
import { spawn } from 'child_process';
import path from 'path';

/**
 * @param {'single'|'multi'|'all'} mode
 * @returns {{ pid: number }}
 */
export function spawnFacebookScraper(mode) {
  const scriptPath = path.join(process.cwd(), 'facebook-worker-runner.js');

  const child = spawn('node', [scriptPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, FACEBOOK_MODE: mode },
  });

  child.unref();

  return { pid: child.pid };
}
