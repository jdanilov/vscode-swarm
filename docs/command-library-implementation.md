# Command Library Implementation Guide

This document outlines how to implement a Commands/Skills Library feature for Swarm, based on the implementation in the `/opt/ed/dash` project.

## Overview

The Command Library allows users to manage reusable Claude Code resources across projects and tasks:

- **Commands**: Single `.md` files (slash commands like `/review`, `/test`)
- **Skills**: Directories containing `SKILL.md` (more complex, stateful behaviors)
- **Metaprompts**: `.md` files injected into `CLAUDE.md` context

## Reference Implementation (Dash)

### Core Service

Location: `src/main/services/CommandLibraryService.ts`

The `CommandLibraryService` is a static utility class that:
- Manages import/export of commands, skills, and metaprompts
- Handles deduplication by file path
- Watches files for changes/deletion
- Injects resources into task worktrees via symlinks

### Data Model

```typescript
// Library-level command definition
interface LibraryCommand {
  id: string;                    // UUID
  name: string;                  // filename or directory name
  displayName: string;           // "/" prefix for commands, plain for others
  filePath: string;              // absolute path to source file
  type: 'command' | 'skill' | 'metaprompt';
  enabledByDefault: boolean;     // global default
  createdAt: string;
  updatedAt: string;
}

// Per-task override
interface TaskCommand {
  id: string;
  taskId: string;
  commandId: string;
  enabled: boolean;              // task-specific override
  updatedAt: string;
}
```

### Enable/Disable Priority System

Three-level priority (highest to lowest):

1. **Task-specific override**: Direct entry in task's enabled commands
2. **Project defaults**: Project-level enable/disable lists
3. **Command's enabledByDefault**: Global fallback

### Resource Import

Supported input formats:

| Input | Result |
|-------|--------|
| Single `.md` file | Added as command |
| Directory with `SKILL.md` | Added as skill |
| `.claude/` directory | Bulk import all commands, skills, metaprompts |
| `commands/` directory | Bulk import all `.md` as commands |
| `skills/` directory | Bulk import all skill subdirectories |
| `metaprompts/` directory | Bulk import all `.md` as metaprompts |

### Integration with Claude Code

**Commands & Skills** are injected via symlinks:
```
.claude/commands/<name>.md  → symlink to source
.claude/skills/<name>/      → symlink to source directory
```

Benefits of symlinks:
- Changes to source propagate instantly
- Storage efficient (no duplication)
- Stateful skills can be shared across tasks

**Metaprompts** are injected into `CLAUDE.md`:
- Original content backed up to `.claude/.claude-md-backup`
- Metaprompt content appended with separators
- Restored when metaprompts are disabled

### .gitignore Management

The service maintains a managed section in `.gitignore`:
```gitignore
# Managed by Dash - DO NOT EDIT THIS SECTION
.claude/commands/review.md
.claude/skills/testing/
# End managed section
```

### File Watching

- **Commands/Skills**: Watch for deletion only (content changes propagate via symlinks)
- **Metaprompts**: Watch for both changes and deletion (requires session restart)

## Swarm Implementation Plan

### Storage

Extend `.vscode/swarm.json` or create `.vscode/swarm-commands.json`:

```typescript
interface CommandLibraryStorage {
  commands: LibraryCommand[];
}

// Extend existing Task interface
interface Task {
  // ... existing fields
  enabledCommands?: string[];    // command IDs enabled for this task
  disabledCommands?: string[];   // command IDs disabled for this task
}
```

### New Service: CommandLibraryService

Location: `src/services/CommandLibraryService.ts`

```typescript
export class CommandLibraryService {
  constructor(
    private context: vscode.ExtensionContext,
    private storageService: StorageService
  ) {}

  // Library management
  async addCommands(paths: string[]): Promise<void>;
  async removeCommand(id: string): Promise<void>;
  async getAllCommands(): Promise<LibraryCommand[]>;

  // Per-task management
  async getTaskCommands(taskId: string): Promise<(LibraryCommand & { enabled: boolean })[]>;
  async toggleCommand(taskId: string, commandId: string): Promise<void>;

  // Injection
  async injectCommands(task: Task): Promise<void>;
  async reinjectCommands(task: Task): Promise<void>;
}
```

### Integration Points

1. **ClaudeSpawner.spawn()**: Call `injectCommands()` before starting terminal
2. **Task restart**: Call `reinjectCommands()` to update symlinks
3. **NewTaskPanel**: Add command selection UI
4. **TaskTreeProvider**: Add commands section or inline indicators

### UI Components

#### Option A: Extend TaskTreeProvider

Add a "Commands" section at the top level:
```
SWARM
├── Commands
│   ├── /review (enabled by default)
│   ├── /test (disabled by default)
│   └── coding-standards (metaprompt)
├── Task 1
│   └── [context menu: Configure Commands]
└── Task 2
```

#### Option B: Separate CommandTreeProvider

New tree view in the sidebar dedicated to command management.

#### NewTaskPanel Enhancement

Add a collapsible "Commands" section:
- Checkboxes for each library command
- Pre-populated based on defaults
- Override per-task

### VS Code Commands to Register

| Command | Description |
|---------|-------------|
| `swarm.addCommand` | Import command/skill from file picker |
| `swarm.removeCommand` | Remove from library |
| `swarm.toggleCommandDefault` | Toggle enabledByDefault |
| `swarm.configureTaskCommands` | Open command picker for specific task |
| `swarm.openCommandSource` | Open source file in editor |

### Implementation Steps

1. **Phase 1: Core Service**
   - [ ] Create `CommandLibraryService`
   - [ ] Add storage schema to `StorageService`
   - [ ] Implement add/remove/list commands

2. **Phase 2: Injection**
   - [ ] Implement symlink creation in `injectCommands()`
   - [ ] Handle metaprompt injection into `CLAUDE.md`
   - [ ] Integrate with `ClaudeSpawner`

3. **Phase 3: UI**
   - [ ] Add commands section to `TaskTreeProvider`
   - [ ] Add command selection to `NewTaskPanel`
   - [ ] Register VS Code commands

4. **Phase 4: Polish**
   - [ ] File watching for deleted sources
   - [ ] .gitignore management
   - [ ] Error handling and notifications

## Key Differences from Dash

| Aspect | Dash | Swarm |
|--------|------|-------|
| Storage | SQLite database | JSON file |
| UI Framework | React webviews | VS Code TreeView + Webview |
| File Watchers | Node.js fs.watch | VS Code FileSystemWatcher |
| IPC | Electron IPC | Direct service calls |
| Worktrees | Single project | Multiple worktrees per task |

## Notes

- Symlinks work well on macOS/Linux; Windows may need special handling
- Consider using VS Code's `workspace.fs` API for cross-platform compatibility
- Worktree paths need special handling since commands inject into worktree, not main repo
