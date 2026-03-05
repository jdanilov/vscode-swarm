import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { git, exec } from '../utils/gitUtils';

export class WorktreeService {
  /**
   * Create a git worktree for a task.
   * Returns the worktree path, branch name, and base branch.
   */
  async createWorktree(
    projectPath: string,
    taskName: string,
    baseRef?: string,
  ): Promise<{ worktreePath: string; branch: string; baseBranch: string }> {
    const slug = this.slugify(taskName);
    const hash = crypto.randomBytes(2).toString('hex');
    const branch = `${slug}-${hash}`;
    const worktreeDir = path.join(projectPath, '..', 'worktrees');
    const worktreePath = path.join(worktreeDir, `${slug}-${hash}`);

    // Ensure worktree parent dir exists
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    // Resolve base ref (strip origin/ prefix for local branch name)
    const baseResolved = baseRef || (await this.resolveBaseRef(projectPath));
    const baseBranch = baseResolved.replace(/^origin\//, '');

    // Create worktree
    await git(['worktree', 'add', '-b', branch, worktreePath, baseResolved], projectPath);

    // Copy preserved files
    await this.copyPreservedFiles(projectPath, worktreePath);

    return { worktreePath, branch, baseBranch };
  }

  /**
   * Remove a worktree and optionally its branch.
   */
  async removeWorktree(projectPath: string, worktreePath: string, branch?: string): Promise<void> {
    // Safety: never remove the project itself
    if (path.resolve(worktreePath) === path.resolve(projectPath)) {
      throw new Error('Cannot remove the main project worktree');
    }

    try {
      await git(['worktree', 'remove', '--force', worktreePath], projectPath);
    } catch {
      // Fallback: manual cleanup
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
      try {
        await git(['worktree', 'prune'], projectPath);
      } catch {
        // ignore prune errors
      }
    }

    // Delete local branch
    if (branch) {
      try {
        await git(['branch', '-D', branch], projectPath);
      } catch {
        // branch may already be gone
      }
    }
  }

  private async resolveBaseRef(projectPath: string): Promise<string> {
    // Try remote HEAD
    try {
      const ref = (
        await git(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], projectPath)
      ).trim();
      if (ref) return ref;
    } catch {
      // fallback
    }

    // Try current branch
    try {
      const branch = (await git(['branch', '--show-current'], projectPath)).trim();
      if (branch) return branch;
    } catch {
      // fallback
    }

    return 'main';
  }

  private async copyPreservedFiles(src: string, dest: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('swarm');
    const patterns: string[] = config.get('preservedFiles', [
      '.env',
      '.env.local',
      '.envrc',
      'docker-compose.override.yml',
    ]);

    for (const pattern of patterns) {
      const srcFile = path.join(src, pattern);
      const destFile = path.join(dest, pattern);
      if (fs.existsSync(srcFile)) {
        const destDir = path.dirname(destFile);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(srcFile, destFile);
      }
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }
}
