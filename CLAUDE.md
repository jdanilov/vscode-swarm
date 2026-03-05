# Swarm for Claude Code

Swarm is a VS Code extension that runs multiple Claude Code agents in parallel, each in its own git worktree. It provides a sidebar UI for managing tasks, monitoring agent status, and performing git operations.

## Build Commands

```bash
npm run compile       # Build TypeScript to out/
npm run watch         # Watch mode for development
npm run package       # Build and create .vsix package
npm run install-local # Package and install in Cursor
```

## Architecture

### Extension Entry Point
- `src/extension.ts` - Activates the extension, initializes services, registers commands, and wires up event handlers

### Core Services (src/services/)
- **ClaudeSpawner** - Spawns Claude Code in VS Code terminals with hook configuration
- **HookServer** - HTTP server (localhost) receiving callbacks from Claude Code hooks to track busy/idle/waiting status
- **StorageService** - Persists task state to `.vscode/swarm.json`
- **WorktreeService** - Creates/removes git worktrees in `../worktrees/` directory
- **TaskGitService** - Git operations (commit, push, merge) for task branches
- **GitStatsService** - Fetches and caches `git diff --shortstat` for uncommitted changes display

### UI Components
- **TaskTreeProvider** (src/providers/) - VS Code TreeDataProvider showing tasks in sidebar
- **NewTaskPanel** (src/panels/) - Webview form for creating new tasks

### Data Flow
1. User creates task via NewTaskPanel → creates worktree (optional) → saves to StorageService
2. ClaudeSpawner writes `.claude/settings.local.json` with hook config pointing to HookServer
3. Claude Code runs in terminal, sends hook callbacks on user prompt submit (busy) and stop (idle)
4. HookServer emits events → updates task status in StorageService → refreshes TreeView

### Key Types (src/types.ts)
- `Task` - Contains id, sessionId (UUID for --continue), branch, worktreePath, status, model, permissionMode
- `TaskStatus` - 'idle' | 'busy' | 'stopped' | 'waiting'
- `PermissionMode` - 'plan' | 'autoEdit' | 'fullAuto'

## Extension Settings

Configured via VS Code settings:
- `swarm.defaultModel` - Default Claude model (opus/sonnet/haiku)
- `swarm.defaultPermissionMode` - Default mode (plan/autoEdit/fullAuto)
- `swarm.preservedFiles` - Files copied to new worktrees (.env, .env.local, etc.)
- `swarm.notifications` - Show notifications when tasks complete

## Worktree Layout

Worktrees are created at `../worktrees/<task-slug>-<hash>/` relative to the project root, not inside the project directory.
