import * as vscode from 'vscode';
import { Task, TaskStatus } from '../types';
import { StorageService } from '../services/StorageService';
import { GitStatsService, GitStats } from '../services/GitStatsService';

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private gitStatsService = new GitStatsService();

  constructor(private storage: StorageService) {}

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
    const worktreePaths = tasks.map((t) => t.worktreePath).filter((p): p is string => p !== null);

    // Fetch all stats in parallel
    await Promise.all(worktreePaths.map((p) => this.gitStatsService.fetchStats(p)));

    // Refresh tree to show updated stats
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  getChildren(): TaskItem[] {
    const tasks = this.storage.getTasks();
    if (tasks.length === 0) {
      return [];
    }

    // Create TaskItems with cached stats
    const items = tasks.map((task) => {
      const stats = this.gitStatsService.getCachedStats(task.worktreePath);
      return new TaskItem(task, stats, this.gitStatsService);
    });

    // Trigger async fetch for any tasks without cached stats
    // This will update the tree when stats are available
    this.fetchMissingStats(tasks);

    return items;
  }

  private fetchMissingStats(tasks: Task[]): void {
    const missingPaths = tasks
      .filter((t) => t.worktreePath && !this.gitStatsService.getCachedStats(t.worktreePath))
      .map((t) => t.worktreePath!);

    if (missingPaths.length > 0) {
      // Fetch stats asynchronously and refresh tree when done
      Promise.all(missingPaths.map((p) => this.gitStatsService.fetchStats(p))).then(() => {
        // Only refresh if we actually got some stats
        const hasNewStats = missingPaths.some((p) => this.gitStatsService.getCachedStats(p));
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

    // Context value for menu visibility rules
    const worktreeFlag = task.worktreePath ? '-worktree' : '';
    this.contextValue = `task-${task.status}${worktreeFlag}`;
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

    // Add git stats for worktree tasks
    if (this.task.worktreePath) {
      const statsStr = this.gitStatsService.formatStats(this.gitStats);
      if (statsStr) {
        parts.push(statsStr);
      }
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
