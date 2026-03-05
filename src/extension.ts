import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { StorageService } from './services/StorageService';
import { WorktreeService } from './services/WorktreeService';
import { HookServer, ActivityEvent } from './services/HookServer';
import { ClaudeSpawner } from './services/ClaudeSpawner';
import { TaskGitService } from './services/TaskGitService';
import { TaskTreeProvider, TaskItem } from './providers/TaskTreeProvider';
import { NewTaskPanel, NewTaskFormData } from './panels/NewTaskPanel';
import { PermissionMode, Model, Task } from './types';
import { getErrorMessage } from './utils/errorUtils';

let hookServer: HookServer;
let spawner: ClaudeSpawner;
let storage: StorageService;
let worktreeService: WorktreeService;
let taskGitService: TaskGitService;
let treeProvider: TaskTreeProvider;
let extensionUri: vscode.Uri;

export async function activate(context: vscode.ExtensionContext) {
  // Store extension URI for webview panels
  extensionUri = context.extensionUri;

  // Initialize services
  storage = new StorageService();
  worktreeService = new WorktreeService();
  taskGitService = new TaskGitService();
  hookServer = new HookServer();
  const port = await hookServer.start();

  spawner = new ClaudeSpawner(hookServer);

  // Activity tracking
  hookServer.on('activity', (event: ActivityEvent) => {
    storage.updateTask(event.taskId, { status: event.status });
    treeProvider.refresh();

    // When a task becomes idle, refresh git stats (Claude likely made changes)
    if (event.status === 'idle') {
      // Refresh git stats asynchronously
      treeProvider.refreshGitStats();

      // Notification on idle (only if Swarm panel is not visible)
      const config = vscode.workspace.getConfiguration('swarm');
      if (config.get('notifications', true) && !treeView.visible) {
        const task = storage.getTask(event.taskId);
        const msg = task ? `${task.name} finished` : 'Task finished';
        vscode.window.showInformationMessage(`Swarm: ${msg}`);
      }
    }
  });

  // Tree view
  treeProvider = new TaskTreeProvider(storage);
  const treeView = vscode.window.createTreeView('swarmTasks', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  // Click task to open terminal
  treeView.onDidChangeSelection((e) => {
    if (e.selection.length > 0) {
      const item = e.selection[0];
      openTerminal(item);
    }
  });

  // Register commands
  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand('swarm.newTask', () => newTask()),
    vscode.commands.registerCommand('swarm.deleteTask', (item: TaskItem) => deleteTask(item)),
    vscode.commands.registerCommand('swarm.openTerminal', (item: TaskItem) => openTerminal(item)),
    vscode.commands.registerCommand('swarm.switchWorktree', (item: TaskItem) =>
      switchWorktree(item),
    ),
    vscode.commands.registerCommand('swarm.resumeTask', (item: TaskItem) => resumeTask(item)),
    vscode.commands.registerCommand('swarm.refreshTasks', () => treeProvider.refresh()),
    vscode.commands.registerCommand('swarm.commitTask', (item: TaskItem) => commitTask(item)),
    vscode.commands.registerCommand('swarm.syncTask', (item: TaskItem) => syncTask(item)),
    vscode.commands.registerCommand('swarm.mergeTask', (item: TaskItem) => mergeTask(item)),
  );

  // Handle tasks that were active before restart - resume sessions in orphaned terminals
  handleStaleTasksOnRestart(storage, treeProvider, spawner);

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBar.command = 'swarmTasks.focus';
  context.subscriptions.push(statusBar);

  function updateStatusBar() {
    const tasks = storage.getTasks();
    const busy = tasks.filter((t) => t.status === 'busy').length;
    const total = tasks.length;
    if (total === 0) {
      statusBar.hide();
    } else {
      statusBar.text = `$(organization) ${busy}/${total} agents`;
      statusBar.tooltip = `Swarm: ${busy} busy, ${total - busy} idle`;
      statusBar.show();
    }
  }

  // Update status bar on activity
  hookServer.on('activity', updateStatusBar);
  updateStatusBar();

  console.log(`Swarm extension activated (hook server on port ${port})`);
}

export function deactivate() {
  spawner?.disposeAll();
  hookServer?.stop();
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

  NewTaskPanel.show(
    extensionUri,
    defaultModel,
    defaultPermissionMode,
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
    sessionId: crypto.randomUUID(), // Claude Code session ID - must be a valid UUID
    name: data.name,
    branch: '',
    baseBranch: '',
    worktreePath: null,
    permissionMode: data.permissionMode,
    model: data.model,
    status: 'stopped',
    createdAt: new Date().toISOString(),
  };

  // Create worktree if requested
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

  // Auto-spawn the task
  await spawnTask(task);
}

async function spawnTask(task: Task, resume = false) {
  const projectPath = getProjectPath();
  if (!projectPath) return;

  try {
    // Start as idle - hooks will update to busy when user submits prompt
    storage.updateTask(task.id, { status: 'idle' });
    treeProvider.refresh();
    await spawner.spawn(task, projectPath, resume);
  } catch (err: unknown) {
    storage.updateTask(task.id, { status: 'stopped' });
    treeProvider.refresh();
    vscode.window.showErrorMessage(`Failed to start Claude: ${getErrorMessage(err)}`);
  }
}

async function deleteTask(item: TaskItem) {
  const task = item.task;
  const confirm = await vscode.window.showWarningMessage(
    `Delete task "${task.name}"?${task.worktreePath ? ' This will also remove the worktree.' : ''}`,
    { modal: true },
    'Delete',
  );
  if (confirm !== 'Delete') return;

  // Kill terminal
  spawner.killTerminal(task.id);

  // Remove worktree
  if (task.worktreePath) {
    const projectPath = getProjectPath();
    if (projectPath) {
      try {
        await worktreeService.removeWorktree(projectPath, task.worktreePath, task.branch);
      } catch (err: unknown) {
        vscode.window.showWarningMessage(`Worktree cleanup failed: ${getErrorMessage(err)}`);
      }
    }
  }

  storage.removeTask(task.id);
  treeProvider.refresh();
}

function openTerminal(item: TaskItem) {
  if (spawner.hasTerminal(item.task.id)) {
    spawner.focusTerminal(item.task.id);
  } else {
    // Spawn and resume existing conversation
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

async function commitTask(item: TaskItem) {
  const projectPath = getProjectPath();
  if (!projectPath) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }
  const success = await taskGitService.commit(item.task, projectPath);
  if (success) {
    treeProvider.refreshGitStats();
  }
}

async function syncTask(item: TaskItem) {
  const projectPath = getProjectPath();
  if (!projectPath) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }
  await taskGitService.sync(item.task, projectPath);
}

async function mergeTask(item: TaskItem) {
  const projectPath = getProjectPath();
  if (!projectPath) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }
  await taskGitService.merge(item.task, projectPath);
}

/**
 * Handle tasks that were active before VS Code restarted.
 * Closes orphaned terminals and spawns fresh ones to resume sessions.
 */
function handleStaleTasksOnRestart(
  storage: StorageService,
  treeProvider: TaskTreeProvider,
  spawnerInstance: ClaudeSpawner,
): void {
  const tasks = storage.getTasks();
  const staleTasks = tasks.filter(
    (t) => t.status === 'busy' || t.status === 'idle' || t.status === 'waiting',
  );

  if (staleTasks.length === 0) return;

  // Find and close orphaned shell terminals (VS Code restores them as "bash")
  for (const terminal of vscode.window.terminals) {
    const name = terminal.name.toLowerCase();
    if (name === 'bash' || name === 'zsh' || name === 'sh') {
      terminal.dispose();
    }
  }

  // Spawn fresh terminals for stale tasks (resume existing conversations)
  const projectPath = getProjectPath();
  for (const task of staleTasks) {
    if (projectPath) {
      spawnerInstance.spawn(task, projectPath, true);
      storage.updateTask(task.id, { status: 'idle' });
    } else {
      storage.updateTask(task.id, { status: 'stopped' });
    }
  }

  treeProvider.refresh();
}

function getProjectPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
