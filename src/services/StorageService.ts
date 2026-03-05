import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { SwarmState, Task } from '../types';

const STORAGE_KEY = 'swarm.tasks';

export class StorageService {
  private state: SwarmState = { tasks: [] };

  constructor(private context: vscode.ExtensionContext) {
    this.load();
  }

  private load(): void {
    const stored = this.context.workspaceState.get<SwarmState>(STORAGE_KEY);
    if (stored) {
      this.state = stored;
      this.migrateTasksWithoutSessionId();
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
    this.context.workspaceState.update(STORAGE_KEY, this.state);
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
