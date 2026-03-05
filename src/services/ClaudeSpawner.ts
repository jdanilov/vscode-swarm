import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Task } from '../types';
import { HookServer } from './HookServer';

/**
 * Spawns Claude Code in VS Code integrated terminals.
 * Manages one terminal per task, configures hooks for activity tracking.
 */
export class ClaudeSpawner {
  private terminals = new Map<string, vscode.Terminal>();

  constructor(private hookServer: HookServer) {}

  /**
   * Spawn a new Claude Code session for a task.
   * @param resume - If true, use --continue to resume existing conversation
   * @throws Error if worktree path doesn't exist
   */
  async spawn(task: Task, projectPath: string, resume = false): Promise<vscode.Terminal> {
    // Kill existing managed terminal for this task if any
    this.killTerminal(task.id);

    const cwd = task.worktreePath || projectPath;

    // Validate that the working directory exists
    if (!fs.existsSync(cwd)) {
      throw new Error(
        `Working directory does not exist: ${cwd}\n\nThe worktree may have been deleted externally. Please delete this task and create a new one.`,
      );
    }

    // Write hook config before spawning (taskId is passed via env var, not in config)
    this.writeHookConfig(cwd);

    // Build claude command
    const claudeBinary = this.findClaudeBinary();
    const args = this.buildArgs(task, resume);
    const claudeCmd = [claudeBinary, ...args].join(' ');

    // If resuming, create a fallback command that starts fresh if --continue fails
    let fullCmd: string;
    if (resume) {
      const freshArgs = this.buildArgs(task, false);
      const freshCmd = [claudeBinary, ...freshArgs].join(' ');
      fullCmd = `${claudeCmd} 2>/dev/null || ${freshCmd}`;
    } else {
      fullCmd = claudeCmd;
    }

    const terminalName = `Swarm: ${task.name}`;

    const terminal = vscode.window.createTerminal({
      name: terminalName,
      cwd,
      env: { SWARM_TASK_ID: task.id },
      iconPath: new vscode.ThemeIcon('hubot'),
      location: vscode.TerminalLocation.Editor,
    });

    terminal.show(false); // false = don't take focus

    // Send command after short delay for terminal to initialize
    setTimeout(() => {
      terminal.sendText(`clear && ${fullCmd}`);
    }, 50);

    this.terminals.set(task.id, terminal);

    // Listen for terminal close
    const disposable = vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal) {
        this.terminals.delete(task.id);
        disposable.dispose();
      }
    });

    return terminal;
  }

  /**
   * Focus the terminal for a task.
   */
  focusTerminal(taskId: string): void {
    const terminal = this.terminals.get(taskId);
    if (terminal) {
      terminal.show(true);
    }
  }

  /**
   * Check if a terminal exists and is alive for a task.
   */
  hasTerminal(taskId: string): boolean {
    return this.terminals.has(taskId);
  }

  /**
   * Kill the terminal for a task.
   */
  killTerminal(taskId: string): void {
    const terminal = this.terminals.get(taskId);
    if (terminal) {
      terminal.dispose();
      this.terminals.delete(taskId);
    }
  }

  /**
   * Kill all managed terminals (called on extension deactivate).
   */
  disposeAll(): void {
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
  }

  private buildArgs(task: Task, resume: boolean): string[] {
    const args: string[] = [];

    // Resume: continue existing session
    if (resume) {
      args.push('--continue');
    }

    // Permission mode (only fullAuto has a CLI flag)
    if (task.permissionMode === 'fullAuto') {
      args.push('--dangerously-skip-permissions');
    }

    // Model
    args.push('--model', task.model);

    return args;
  }

  private writeHookConfig(cwd: string): void {
    const claudeDir = path.join(cwd, '.claude');
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const settingsPath = path.join(claudeDir, 'settings.local.json');
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {
        // overwrite corrupted
      }
    }

    const hookConfig = this.hookServer.getHookConfig();
    const merged = { ...existing, ...hookConfig };
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  }

  private findClaudeBinary(): string {
    const candidates = [
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      `${process.env.HOME}/.claude/bin/claude`,
      `${process.env.HOME}/.local/bin/claude`,
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }

    return 'claude';
  }
}
