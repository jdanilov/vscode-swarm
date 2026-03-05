import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SwarmState, Task } from '../types';

export class StorageService {
  private state: SwarmState = { tasks: [] };
  private filePath: string | null = null;

  constructor() {
    this.resolveFilePath();
    this.load();
  }

  private resolveFilePath(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return;
    const vscodePath = path.join(folders[0].uri.fsPath, '.vscode');
    if (!fs.existsSync(vscodePath)) {
      fs.mkdirSync(vscodePath, { recursive: true });
    }
    this.filePath = path.join(vscodePath, 'swarm.json');
  }

  private load(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.state = JSON.parse(raw);
      this.migrateTasksWithoutSessionId();
    } catch {
      this.state = { tasks: [] };
    }
  }

  private migrateTasksWithoutSessionId(): void {
    let needsSave = false;
    for (const task of this.state.tasks) {
      if (!task.sessionId) {
        task.sessionId = crypto.randomUUID();
        needsSave = true;
      }
    }
    if (needsSave) {
      this.save();
    }
  }

  private save(): void {
    if (!this.filePath) return;
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  getTasks(): Task[] {
    return this.state.tasks;
  }

  getTask(id: string): Task | undefined {
    return this.state.tasks.find((t) => t.id === id);
  }

  addTask(task: Task): void {
    this.state.tasks.push(task);
    this.save();
  }

  updateTask(id: string, updates: Partial<Task>): void {
    const task = this.state.tasks.find((t) => t.id === id);
    if (task) {
      Object.assign(task, updates);
      this.save();
    }
  }

  removeTask(id: string): void {
    this.state.tasks = this.state.tasks.filter((t) => t.id !== id);
    this.save();
  }
}
