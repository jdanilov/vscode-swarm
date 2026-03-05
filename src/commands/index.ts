/**
 * Command handlers for the Swarm extension.
 * Extracted from extension.ts for better separation of concerns.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import { Task, PermissionMode, Model } from '../types';
import { StorageService } from '../services/StorageService';
import { WorktreeService } from '../services/WorktreeService';
import { ClaudeSpawner } from '../services/ClaudeSpawner';
import { TaskGitService } from '../services/TaskGitService';
import { TaskTreeProvider, TaskItem } from '../providers/TaskTreeProvider';
import { NewTaskPanel, NewTaskFormData } from '../panels/NewTaskPanel';
import { getErrorMessage } from '../utils/errorUtils';
import {
  requireProjectPath,
  getProjectPath,
  extractBaseName,
  generateSiblingName,
} from '../utils/taskUtils';

/**
 * Dependencies injected into command handlers.
 */
export interface CommandDeps {
  storage: StorageService;
  worktreeService: WorktreeService;
  taskGitService: TaskGitService;
  spawner: ClaudeSpawner;
  treeProvider: TaskTreeProvider;
  treeView: vscode.TreeView<TaskItem>;
  extensionUri: vscode.Uri;
  updateArchivedContext: () => void;
}

/**
 * Create and register all commands.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  const {
    storage,
    worktreeService,
    taskGitService,
    spawner,
    treeProvider,
    treeView,
    extensionUri,
    updateArchivedContext,
  } = deps;

  // Helper to spawn a task
  async function spawnTask(task: Task, resume = false) {
    const projectPath = getProjectPath();
    if (!projectPath) return;

    try {
      storage.updateTask(task.id, { status: 'idle' });
      treeProvider.refresh();
      await spawner.spawn(task, projectPath, resume);
    } catch (err: unknown) {
      storage.updateTask(task.id, { status: 'stopped' });
      treeProvider.refresh();
      vscode.window.showErrorMessage(`Failed to start Claude: ${getErrorMessage(err)}`);
    }
  }

  // --- Command implementations ---

  function newTask() {
    const projectPath = getProjectPath();
    if (!projectPath) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const config = vscode.workspace.getConfiguration('swarm');
    const defaultPermissionMode = config.get<PermissionMode>('defaultPermissionMode', 'fullAuto');
    const defaultModel = config.get<Model>('defaultModel', 'opus');
    const worktreeBasePath = path.join(projectPath, '..', 'worktrees');

    NewTaskPanel.show(
      extensionUri,
      defaultModel,
      defaultPermissionMode,
      worktreeBasePath,
      async (data: NewTaskFormData) => {
        await createTaskFromForm(projectPath, data);
      },
      () => {
        // Cancel - do nothing
      },
    );
  }

  async function createTaskFromForm(projectPath: string, data: NewTaskFormData) {
    const task: Task = {
      id: crypto.randomBytes(6).toString('hex'),
      sessionId: crypto.randomUUID(),
      name: data.name,
      branch: '',
      baseBranch: '',
      worktreePath: null,
      permissionMode: data.permissionMode,
      model: data.model,
      status: 'stopped',
      createdAt: new Date().toISOString(),
    };

    if (data.useWorktree) {
      try {
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Creating worktree...' },
          () => worktreeService.createWorktree(projectPath, data.name),
        );
        task.worktreePath = result.worktreePath;
        task.branch = result.branch;
        task.baseBranch = result.baseBranch;
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to create worktree: ${getErrorMessage(err)}`);
        return;
      }
    }

    storage.addTask(task);
    treeProvider.refresh();

    const taskItem = treeProvider.getTaskItem(task.id);
    if (taskItem) {
      treeView.reveal(taskItem, { select: true, focus: true });
    }

    await spawnTask(task);
  }

  function archiveTask(item: TaskItem) {
    spawner.killTerminal(item.task.id);
    storage.archiveTask(item.task.id);
    treeProvider.refresh();
    updateArchivedContext();
  }

  function restoreTask(item: TaskItem) {
    storage.restoreTask(item.task.id);
    treeProvider.refresh();
    updateArchivedContext();
  }

  function toggleShowArchived() {
    treeProvider.setShowArchived(!treeProvider.showArchived);
    vscode.commands.executeCommand('setContext', 'swarm.showingArchived', treeProvider.showArchived);
  }

  async function deleteTask(item: TaskItem) {
    const task = item.task;

    const siblingTasks = task.worktreePath
      ? storage.getTasks().filter((t) => t.id !== task.id && t.worktreePath === task.worktreePath)
      : [];
    const willRemoveWorktree = task.worktreePath && siblingTasks.length === 0;

    if (willRemoveWorktree) {
      const confirm = await vscode.window.showWarningMessage(
        `Delete task "${task.name}"? This will also remove the worktree.`,
        'Delete',
        'Cancel',
      );
      if (confirm !== 'Delete') return;
    }

    spawner.killTerminal(task.id);

    if (willRemoveWorktree) {
      const projectPath = getProjectPath();
      if (projectPath) {
        try {
          await worktreeService.removeWorktree(projectPath, task.worktreePath!, task.branch);
        } catch (err: unknown) {
          vscode.window.showWarningMessage(`Worktree cleanup failed: ${getErrorMessage(err)}`);
        }
      }
    }

    storage.removeTask(task.id);
    treeProvider.refresh();
    updateArchivedContext();
  }

  function openTerminal(item: TaskItem) {
    if (spawner.hasTerminal(item.task.id)) {
      spawner.focusTerminal(item.task.id);
    } else {
      spawnTask(item.task, true);
    }
  }

  async function switchWorktree(item: TaskItem) {
    const task = item.task;
    if (!task.worktreePath) {
      vscode.window.showInformationMessage('This task runs in the current workspace');
      return;
    }

    const uri = vscode.Uri.file(task.worktreePath);
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
  }

  async function resumeTask(item: TaskItem) {
    await spawnTask(item.task, true);
  }

  async function renameTask(item: TaskItem) {
    const task = item.task;
    const newName = await vscode.window.showInputBox({
      title: 'Rename Task',
      value: task.name,
      prompt: 'Enter a new name for this task',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Task name cannot be empty';
        }
        return null;
      },
    });

    if (newName && newName.trim() !== task.name) {
      storage.updateTask(task.id, { name: newName.trim() });
      treeProvider.refresh();
    }
  }

  async function commitTask(item: TaskItem) {
    const projectPath = requireProjectPath();
    if (!projectPath) return;

    const success = await taskGitService.commit(item.task, projectPath);
    if (success) {
      treeProvider.refreshGitStats();
    }
  }

  async function syncTask(item: TaskItem) {
    const projectPath = requireProjectPath();
    if (!projectPath) return;

    await taskGitService.sync(item.task, projectPath);
  }

  async function mergeTask(item: TaskItem) {
    const projectPath = requireProjectPath();
    if (!projectPath) return;

    await taskGitService.merge(item.task, projectPath);
  }

  async function mergeBaseIntoTask(item: TaskItem) {
    const projectPath = requireProjectPath();
    if (!projectPath) return;

    await taskGitService.mergeBaseInto(item.task, projectPath);
  }

  async function newTaskInBranch(item: TaskItem) {
    const sourceTask = item.task;
    const baseName = extractBaseName(sourceTask.name);

    const suffix = await vscode.window.showInputBox({
      title: 'New Task in Branch',
      prompt: 'Enter a suffix for the new task (leave empty for auto-numbering)',
      placeHolder: 'e.g. "-test" or "Review" or leave empty',
    });

    if (suffix === undefined) return;

    let newName: string;
    if (suffix === '') {
      newName = generateSiblingName(sourceTask.name, storage.getTasks());
    } else if (suffix.startsWith('-')) {
      newName = baseName + suffix;
    } else {
      newName = baseName + ' ' + suffix;
    }

    const task: Task = {
      id: crypto.randomBytes(6).toString('hex'),
      sessionId: crypto.randomUUID(),
      name: newName,
      branch: sourceTask.branch,
      baseBranch: sourceTask.baseBranch,
      worktreePath: sourceTask.worktreePath,
      permissionMode: sourceTask.permissionMode,
      model: sourceTask.model,
      status: 'stopped',
      createdAt: new Date().toISOString(),
    };

    storage.addTask(task);
    treeProvider.refresh();

    const taskItem = treeProvider.getTaskItem(task.id);
    if (taskItem) {
      treeView.reveal(taskItem, { select: true, focus: true });
    }

    await spawnTask(task);
  }

  // Register all commands
  context.subscriptions.push(
    vscode.commands.registerCommand('swarm.newTask', newTask),
    vscode.commands.registerCommand('swarm.deleteTask', deleteTask),
    vscode.commands.registerCommand('swarm.archiveTask', archiveTask),
    vscode.commands.registerCommand('swarm.restoreTask', restoreTask),
    vscode.commands.registerCommand('swarm.toggleShowArchived', toggleShowArchived),
    vscode.commands.registerCommand('swarm.openTerminal', openTerminal),
    vscode.commands.registerCommand('swarm.switchWorktree', switchWorktree),
    vscode.commands.registerCommand('swarm.resumeTask', resumeTask),
    vscode.commands.registerCommand('swarm.refreshTasks', () => treeProvider.refresh()),
    vscode.commands.registerCommand('swarm.commitTask', commitTask),
    vscode.commands.registerCommand('swarm.syncTask', syncTask),
    vscode.commands.registerCommand('swarm.mergeTask', mergeTask),
    vscode.commands.registerCommand('swarm.mergeBaseIntoTask', mergeBaseIntoTask),
    vscode.commands.registerCommand('swarm.newTaskInBranch', newTaskInBranch),
    vscode.commands.registerCommand('swarm.renameTask', renameTask),
  );
}

/**
 * Handle tasks that were active before VS Code restarted.
 * Closes orphaned terminals and spawns fresh ones to resume sessions.
 */
export function handleStaleTasksOnRestart(
  storage: StorageService,
  treeProvider: TaskTreeProvider,
  spawner: ClaudeSpawner,
): void {
  const tasks = storage.getTasks();
  const staleTasks = tasks.filter(
    (t) => t.status === 'busy' || t.status === 'idle' || t.status === 'waiting',
  );

  if (staleTasks.length === 0) return;

  // Find and close orphaned shell terminals
  for (const terminal of vscode.window.terminals) {
    const name = terminal.name.toLowerCase();
    if (name === 'bash' || name === 'zsh' || name === 'sh') {
      terminal.dispose();
    }
  }

  const projectPath = getProjectPath();
  for (const task of staleTasks) {
    if (projectPath) {
      spawner.spawn(task, projectPath, true);
      storage.updateTask(task.id, { status: 'idle' });
    } else {
      storage.updateTask(task.id, { status: 'stopped' });
    }
  }

  treeProvider.refresh();
}
