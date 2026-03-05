/**
 * Git operations for tasks (commit, sync, merge).
 * Extracted from extension.ts for better separation of concerns.
 */

import * as vscode from 'vscode';
import { Task } from '../types';
import { git } from '../utils/gitUtils';
import { getErrorMessage } from '../utils/errorUtils';

export class TaskGitService {
  /**
   * Commit all changes in a task's working directory.
   */
  async commit(task: Task, projectPath: string): Promise<boolean> {
    const cwd = task.worktreePath || projectPath;

    const message = await vscode.window.showInputBox({
      prompt: 'Commit message',
      placeHolder: 'e.g. feat: add authentication',
      validateInput: (v) => (v.trim() ? null : 'Commit message is required'),
    });
    if (!message) return false;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Committing changes in ${task.name}...`,
        },
        async () => {
          await git(['add', '-A'], cwd);
          await git(['commit', '-m', message], cwd);
        },
      );
      vscode.window.showInformationMessage(`Committed: ${message}`);
      return true;
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg.includes('nothing to commit')) {
        vscode.window.showInformationMessage('Nothing to commit');
      } else {
        vscode.window.showErrorMessage(`Commit failed: ${msg}`);
      }
      return false;
    }
  }

  /**
   * Sync a task's branch with origin (pull then push).
   */
  async sync(task: Task, projectPath: string): Promise<boolean> {
    const cwd = task.worktreePath || projectPath;
    const branch = task.branch || 'current branch';

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Syncing ${branch}...`,
        },
        async () => {
          await git(['pull', '--rebase'], cwd);
          if (task.branch) {
            await git(['push', '-u', 'origin', task.branch], cwd);
          } else {
            await git(['push'], cwd);
          }
        },
      );
      vscode.window.showInformationMessage(`Synced ${branch} with origin`);
      return true;
    } catch (err: unknown) {
      vscode.window.showErrorMessage(`Sync failed: ${getErrorMessage(err)}`);
      return false;
    }
  }

  /**
   * Merge a task's branch into its base branch.
   */
  async merge(task: Task, projectPath: string): Promise<boolean> {
    if (!task.worktreePath) {
      vscode.window.showErrorMessage('Merge is only available for worktree tasks');
      return false;
    }

    if (!task.branch) {
      vscode.window.showErrorMessage('No branch found for this task');
      return false;
    }

    if (!task.baseBranch) {
      vscode.window.showErrorMessage('No base branch found for this task');
      return false;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Merge "${task.branch}" into "${task.baseBranch}"?`,
      { modal: true },
      'Merge',
    );
    if (confirm !== 'Merge') return false;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Merging ${task.branch} into ${task.baseBranch}...`,
        },
        async () => {
          await git(['checkout', task.baseBranch], projectPath);
          await git(['pull'], projectPath);
          await git(['merge', task.branch], projectPath);
          await git(['push'], projectPath);
        },
      );
      vscode.window.showInformationMessage(
        `Merged ${task.branch} into ${task.baseBranch} and pushed`,
      );
      return true;
    } catch (err: unknown) {
      vscode.window.showErrorMessage(`Merge failed: ${getErrorMessage(err)}`);
      return false;
    }
  }
}
