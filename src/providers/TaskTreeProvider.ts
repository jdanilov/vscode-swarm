import * as vscode from 'vscode';
import { Task, TaskStatus } from '../types';
import { StorageService } from '../services/StorageService';
import { GitStatsService, GitStats } from '../services/GitStatsService';

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private gitStatsService = new GitStatsService();
  private _showArchived = false;

  constructor(private storage: StorageService) {}

  get showArchived(): boolean {
    return this._showArchived;
  }

  setShowArchived(show: boolean): void {
    this._showArchived = show;
    this._onDidChangeTreeData.fire();
  }

  hasArchivedTasks(): boolean {
    return this.storage.hasArchivedTasks();
  }

  /**
   * Get the effective git path for a task.
   * Uses worktreePath if available, otherwise falls back to workspace root.
   */
  private getEffectivePath(task: Task): string | null {
    if (task.worktreePath) {
      return task.worktreePath;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  refresh(): void {
    // Invalidate all git stats cache on refresh to get fresh data
    this.gitStatsService.invalidate();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Refresh git stats for all tasks and update the tree.
   * This is async and will update the tree when stats are fetched.
   */
  async refreshGitStats(): Promise<void> {
    // Invalidate cache first to get fresh data
    this.gitStatsService.invalidate();

    const tasks = this.storage.getTasks();
    const paths = tasks.map((t) => this.getEffectivePath(t)).filter((p): p is string => p !== null);

    // Deduplicate paths (multiple non-worktree tasks share the same workspace root)
    const uniquePaths = [...new Set(paths)];

    // Fetch all stats in parallel
    await Promise.all(uniquePaths.map((p) => this.gitStatsService.fetchStats(p)));

    // Refresh tree to show updated stats
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get a TaskItem by task ID. Used for revealing items in the tree.
   */
  getTaskItem(taskId: string): TaskItem | undefined {
    const task = this.storage.getTask(taskId);
    if (!task) return undefined;
    const effectivePath = this.getEffectivePath(task);
    const stats = this.gitStatsService.getCachedStats(effectivePath);
    return new TaskItem(task, stats, this.gitStatsService);
  }

  getChildren(): TaskItem[] {
    const tasks = this._showArchived
      ? this.storage.getArchivedTasks()
      : this.storage.getActiveTasks();

    if (tasks.length === 0) {
      return [];
    }

    // Create TaskItems with cached stats using effective path
    const items = tasks.map((task) => {
      const effectivePath = this.getEffectivePath(task);
      const stats = this.gitStatsService.getCachedStats(effectivePath);
      return new TaskItem(task, stats, this.gitStatsService);
    });

    // Trigger async fetch for any tasks without cached stats
    // This will update the tree when stats are available
    this.fetchMissingStats(tasks);

    return items;
  }

  private fetchMissingStats(tasks: Task[]): void {
    const missingPaths = tasks
      .map((t) => this.getEffectivePath(t))
      .filter((p): p is string => p !== null && !this.gitStatsService.getCachedStats(p));

    // Deduplicate paths
    const uniqueMissingPaths = [...new Set(missingPaths)];

    if (uniqueMissingPaths.length > 0) {
      // Fetch stats asynchronously and refresh tree when done
      Promise.all(uniqueMissingPaths.map((p) => this.gitStatsService.fetchStats(p))).then(() => {
        // Only refresh if we actually got some stats
        const hasNewStats = uniqueMissingPaths.some((p) => this.gitStatsService.getCachedStats(p));
        if (hasNewStats) {
          this._onDidChangeTreeData.fire();
        }
      });
    }
  }
}

const statusIcons: Record<TaskStatus, string> = {
  busy: 'sync~spin',
  idle: 'pass',
  waiting: 'bell',
  stopped: 'circle-outline',
};

const statusColors: Record<TaskStatus, vscode.ThemeColor | undefined> = {
  busy: new vscode.ThemeColor('charts.yellow'),
  idle: new vscode.ThemeColor('charts.green'),
  waiting: new vscode.ThemeColor('charts.orange'),
  stopped: undefined,
};

export class TaskItem extends vscode.TreeItem {
  constructor(
    public readonly task: Task,
    private readonly gitStats: GitStats | null,
    private readonly gitStatsService: GitStatsService,
  ) {
    super(task.name, vscode.TreeItemCollapsibleState.None);

    this.id = task.id;
    this.description = this.buildDescription();
    this.tooltip = this.buildTooltip();
    this.iconPath = new vscode.ThemeIcon(statusIcons[task.status], statusColors[task.status]);

    // Click to open terminal (works even when already selected)
    this.command = {
      command: 'swarm.openTerminal',
      title: 'Open Terminal',
      arguments: [this],
    };

    // Context value for menu visibility rules
    const worktreeFlag = task.worktreePath ? '-worktree' : '';
    const archivedFlag = task.archivedAt ? '-archived' : '';
    this.contextValue = `task-${task.status}${worktreeFlag}${archivedFlag}`;
  }

  private buildDescription(): string {
    const parts: string[] = [];
    if (this.task.branch) {
      parts.push(this.task.branch);
    }
    parts.push(this.task.model);
    if (this.task.permissionMode !== 'fullAuto') {
      parts.push(this.task.permissionMode);
    }

    // Add git stats for all tasks (worktree or current workspace)
    const statsStr = this.gitStatsService.formatStats(this.gitStats);
    if (statsStr) {
      parts.push(statsStr);
    }

    return parts.join(' · ');
  }

  private buildTooltip(): string {
    const lines = [
      `Task: ${this.task.name}`,
      `Status: ${this.task.status}`,
      `Branch: ${this.task.branch || '(current)'}`,
      `Model: ${this.task.model}`,
      `Mode: ${this.task.permissionMode}`,
    ];
    if (this.task.baseBranch) {
      lines.push(`Base: ${this.task.baseBranch}`);
    }
    if (this.task.worktreePath) {
      lines.push(`Worktree: ${this.task.worktreePath}`);
    }

    // Add detailed git stats to tooltip
    if (this.gitStats && this.gitStats.filesChanged > 0) {
      lines.push('');
      lines.push('Uncommitted changes:');
      lines.push(
        `  ${this.gitStats.filesChanged} file${this.gitStats.filesChanged > 1 ? 's' : ''} changed`,
      );
      if (this.gitStats.insertions > 0) {
        lines.push(
          `  ${this.gitStats.insertions} insertion${this.gitStats.insertions > 1 ? 's' : ''}(+)`,
        );
      }
      if (this.gitStats.deletions > 0) {
        lines.push(
          `  ${this.gitStats.deletions} deletion${this.gitStats.deletions > 1 ? 's' : ''}(-)`,
        );
      }
    }

    return lines.join('\n');
  }
}
