/**
 * Shared task utilities.
 */

import * as vscode from 'vscode';
import { Task } from '../types';

/**
 * Convert text to a URL-safe slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * Escape special regex characters in a string.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the base name from a task name, stripping any "(N)" suffix.
 * "My Task (2)" -> "My Task"
 */
export function extractBaseName(name: string): string {
  const match = name.match(/^(.+?)\s*\(\d+\)$/);
  return match ? match[1].trim() : name;
}

/**
 * Generate a sibling name for forked tasks.
 * "My Task" -> "My Task (2)" -> "My Task (3)", etc.
 */
export function generateSiblingName(sourceName: string, allTasks: Task[]): string {
  const baseName = extractBaseName(sourceName);

  // Find all tasks with the same base name (including original and existing forks)
  const siblingPattern = new RegExp(`^${escapeRegExp(baseName)}(\\s*\\(\\d+\\))?$`);
  const siblings = allTasks.filter((t) => siblingPattern.test(t.name));

  // Find highest existing number
  let maxNum = 1; // Original counts as 1
  for (const sibling of siblings) {
    const match = sibling.name.match(/\((\d+)\)$/);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }

  return `${baseName} (${maxNum + 1})`;
}

/**
 * Get the working directory for a task.
 */
export function getTaskCwd(task: Task, projectPath: string): string {
  return task.worktreePath || projectPath;
}

/**
 * Get the project path from workspace folders.
 */
export function getProjectPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Get the project path or show an error message if not available.
 * Returns undefined if no workspace is open.
 */
export function requireProjectPath(): string | undefined {
  const projectPath = getProjectPath();
  if (!projectPath) {
    vscode.window.showErrorMessage('No workspace folder open');
  }
  return projectPath;
}
