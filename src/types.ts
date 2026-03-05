export type PermissionMode = 'plan' | 'autoEdit' | 'fullAuto';
export type Model = 'opus' | 'sonnet' | 'haiku';
export type TaskStatus = 'idle' | 'busy' | 'stopped' | 'waiting';

export interface Task {
  id: string;
  sessionId: string; // Claude Code session ID (UUID) - persisted across spawns/resumes
  name: string;
  branch: string;
  baseBranch: string; // branch this task was created from
  worktreePath: string | null; // null = runs in current workspace
  permissionMode: PermissionMode;
  model: Model;
  status: TaskStatus;
  createdAt: string;
  archivedAt?: string; // ISO timestamp when archived, undefined = active
}

export interface SwarmState {
  tasks: Task[];
}
