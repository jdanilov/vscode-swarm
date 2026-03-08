import * as vscode from 'vscode';
import { StorageService } from './services/StorageService';
import { WorktreeService } from './services/WorktreeService';
import { HookServer, ActivityEvent } from './services/HookServer';
import { ClaudeSpawner } from './services/ClaudeSpawner';
import { TaskGitService } from './services/TaskGitService';
import { SoundService } from './services/SoundService';
import { TaskTreeProvider, TaskItem } from './providers/TaskTreeProvider';
import { registerCommands, handleStaleTasksOnRestart } from './commands';

let hookServer: HookServer;
let spawner: ClaudeSpawner;
let storage: StorageService;
let worktreeService: WorktreeService;
let taskGitService: TaskGitService;
let soundService: SoundService;
let treeProvider: TaskTreeProvider;
let treeView: vscode.TreeView<TaskItem>;
let treeViewExplorer: vscode.TreeView<TaskItem>;

export async function activate(context: vscode.ExtensionContext) {
  // Initialize services
  storage = new StorageService(context);
  worktreeService = new WorktreeService();
  taskGitService = new TaskGitService();
  soundService = new SoundService(context.extensionPath);
  hookServer = new HookServer();
  const port = await hookServer.start();

  spawner = new ClaudeSpawner(hookServer);

  // Tree view (activity bar)
  treeProvider = new TaskTreeProvider(storage);
  treeView = vscode.window.createTreeView('swarmTasks', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  // Tree view (explorer)
  treeViewExplorer = vscode.window.createTreeView('swarmTasksExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  // Helper to update archived context
  function updateArchivedContext() {
    vscode.commands.executeCommand('setContext', 'swarm.hasArchivedTasks', treeProvider.hasArchivedTasks());
  }

  // Register commands
  registerCommands(context, {
    storage,
    worktreeService,
    taskGitService,
    spawner,
    treeProvider,
    treeView,
    extensionUri: context.extensionUri,
    updateArchivedContext,
  });

  context.subscriptions.push(treeView, treeViewExplorer);

  // Activity tracking
  hookServer.on('activity', (event: ActivityEvent) => {
    storage.updateTask(event.taskId, { status: event.status });
    treeProvider.refresh();

    if (event.status === 'idle') {
      treeProvider.refreshGitStats();

      const config = vscode.workspace.getConfiguration('swarm');
      if (config.get('notifications', true) && !treeView.visible && !treeViewExplorer.visible) {
        const task = storage.getTask(event.taskId);
        const msg = task ? `${task.name} finished` : 'Task finished';
        vscode.window.showInformationMessage(`Swarm: ${msg}`);
      }

      soundService.playFromConfig();
    }
  });

  // Update context for showing/hiding the toggle archived button
  updateArchivedContext();

  // Handle tasks that were active before restart
  handleStaleTasksOnRestart(storage, treeProvider, spawner);

  // Watch for git changes to auto-refresh stats
  const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/index');
  gitWatcher.onDidChange(() => {
    treeProvider.refreshGitStats();
  });
  context.subscriptions.push(gitWatcher);

  // Refresh stats on file save (detects unstaged changes)
  let saveDebounceTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
      }
      saveDebounceTimer = setTimeout(() => {
        treeProvider.refreshGitStats();
      }, 350);
    }),
  );

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBar.command = 'swarmTasks.focus';
  context.subscriptions.push(statusBar);

  function updateStatusBar() {
    const tasks = storage.getActiveTasks();
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

  hookServer.on('activity', updateStatusBar);
  updateStatusBar();

  console.log(`Swarm extension activated (hook server on port ${port})`);
}

export function deactivate() {
  spawner?.disposeAll();
  hookServer?.stop();
}
