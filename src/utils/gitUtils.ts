/**
 * Shared git utilities.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

export const exec = promisify(execFile);

/**
 * Execute a git command in a given directory.
 */
export async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec('git', args, { cwd });
  return stdout;
}
