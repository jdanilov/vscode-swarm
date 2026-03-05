/**
 * Git operations for tasks with VS Code UI integration.
 * Uses pure GitOperations and adds progress indicators and notifications.
 */

import * as vscode from 'vscode';
import { Task } from '../types';
import { getTaskCwd } from '../utils/taskUtils';
import * as GitOps from './GitOperations';

export class TaskGitService {
  /**
   * Commit all changes in a task's working directory.
   */
  async commit(task: Task, projectPath: string): Promise<boolean> {
    const cwd = getTaskCwd(task, projectPath);

    const message = await vscode.window.showInputBox({
      prompt: 'Commit message',
      placeHolder: 'e.g. feat: add authentication',
      validateInput: (v) => (v.trim() ? null : 'Commit message is required'),
    });
    if (!message) return false;

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Committing changes in ${task.name}...`,
      },
      () => GitOps.commitAll(cwd, message),
    );

    if (result.success) {
      vscode.window.showInformationMessage(`Committed: ${message}`);
      return true;
    }

    if (result.nothingToCommit) {
      vscode.window.showInformationMessage('Nothing to commit');
    } else {
      vscode.window.showErrorMessage(`Commit failed: ${result.error}`);
    }
    return false;
  }

  /**
   * Sync a task's branch with origin (pull then push).
   */
  async sync(task: Task, projectPath: string): Promise<boolean> {
    const cwd = getTaskCwd(task, projectPath);
    const branch = task.branch || 'current branch';

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Syncing ${branch}...`,
      },
      () => GitOps.syncBranch(cwd, task.branch || undefined),
    );

    if (result.success) {
      vscode.window.showInformationMessage(`Synced ${branch} with origin`);
      return true;
    }

    vscode.window.showErrorMessage(`Sync failed: ${result.error}`);
    return false;
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

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Merging ${task.branch} into ${task.baseBranch}...`,
      },
      () => GitOps.mergeBranchInto(projectPath, task.branch, task.baseBranch),
    );

    if (result.success) {
      vscode.window.showInformationMessage(
        `Merged ${task.branch} into ${task.baseBranch} and pushed`,
      );
      return true;
    }

    vscode.window.showErrorMessage(`Merge failed: ${result.error}`);
    return false;
  }

  /**
   * Merge base branch into task's branch (pull latest from base).
   */
  async mergeBaseInto(task: Task, _projectPath: string): Promise<boolean> {
    if (!task.worktreePath) {
      vscode.window.showErrorMessage('Merge is only available for worktree tasks');
      return false;
    }

    if (!task.baseBranch) {
      vscode.window.showErrorMessage('No base branch found for this task');
      return false;
    }

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Merging ${task.baseBranch} into ${task.branch}...`,
      },
      () => GitOps.mergeBaseIntoBranch(task.worktreePath!, task.baseBranch),
    );

    if (result.success) {
      vscode.window.showInformationMessage(`Merged ${task.baseBranch} into ${task.branch}`);
      return true;
    }

    vscode.window.showErrorMessage(`Merge failed: ${result.error}`);
    return false;
  }
}
