/**
 * Pure git operations without UI dependencies.
 * These can be tested in isolation and reused across different UI contexts.
 */

import { git } from '../utils/gitUtils';

export interface CommitResult {
  success: boolean;
  message?: string;
  error?: string;
  nothingToCommit?: boolean;
}

export interface SyncResult {
  success: boolean;
  error?: string;
}

export interface MergeResult {
  success: boolean;
  error?: string;
}

/**
 * Stage all changes and commit with a message.
 */
export async function commitAll(cwd: string, message: string): Promise<CommitResult> {
  try {
    await git(['add', '-A'], cwd);
    await git(['commit', '-m', message], cwd);
    return { success: true, message };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('nothing to commit')) {
      return { success: false, nothingToCommit: true };
    }
    return { success: false, error: errorMsg };
  }
}

/**
 * Check if a remote branch exists.
 */
export async function remoteBranchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(['ls-remote', '--exit-code', 'origin', branch], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sync a branch with origin (pull then push).
 */
export async function syncBranch(cwd: string, branch?: string): Promise<SyncResult> {
  try {
    if (branch) {
      // Check if remote branch exists before trying to pull
      if (await remoteBranchExists(cwd, branch)) {
        await git(['pull', '--rebase', 'origin', branch], cwd);
      }
      await git(['push', '-u', 'origin', branch], cwd);
    } else {
      await git(['pull', '--rebase'], cwd);
      await git(['push'], cwd);
    }
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

/**
 * Merge a branch into another branch (in main project directory).
 */
export async function mergeBranchInto(
  projectPath: string,
  sourceBranch: string,
  targetBranch: string,
): Promise<MergeResult> {
  try {
    await git(['checkout', targetBranch], projectPath);
    await git(['pull'], projectPath);
    await git(['merge', sourceBranch], projectPath);
    await git(['push'], projectPath);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

/**
 * Merge base branch into task branch (fetch and merge origin/base).
 */
export async function mergeBaseIntoBranch(
  worktreePath: string,
  baseBranch: string,
): Promise<MergeResult> {
  try {
    await git(['fetch', 'origin', baseBranch], worktreePath);
    await git(['merge', `origin/${baseBranch}`], worktreePath);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}
