# Features to Migrate from Dash to Swarm

This document tracks features from the Dash Electron app (`/opt/ed/dash`) that should be ported to the Swarm VS Code extension.

## Priority Features

1. ~~**`--fork-session` flag**~~ ✅ DONE
   - Pass this flag when spawning forked tasks so Claude properly forks the session context
   - Implemented as "Fork Session" command

2. **Task Archiving**
   - Soft-delete with restore capability instead of permanent deletion
   - Tasks get `archivedAt` timestamp, can be filtered/restored
   - Location in Dash: `src/shared/types.ts`, database schema

3. **GitHub Issue Linking**
   - Link tasks to GitHub issues
   - Inject issue body into Claude's context
   - Auto-create linked branches
   - Post branch comments on issues
   - Location in Dash: `src/main/services/GithubService.ts`

4. **Worktree Pool**
   - Pre-create a pool of worktrees for instant task startup
   - Reduces task creation latency
   - Location in Dash: `src/main/services/WorktreePoolService.ts`

## Library Management

5. **Commands/Skills Library**
   - Manage reusable slash commands
   - Enable/disable per task
   - Location in Dash: `src/main/services/CommandLibraryService.ts`

6. **MCP Library**
   - Manage MCP server configurations
   - Enable/disable per task
   - Location in Dash: `src/main/services/McpLibraryService.ts`

7. **Agent Library**
   - Manage reusable agent definitions
   - Enable/disable per task
   - Location in Dash: `src/main/services/AgentLibraryService.ts`

## Session Management

8. **Multiple Conversations per Task**
   - Support multiple named Claude sessions within one task
   - Each conversation has its own session ID
   - Location in Dash: `src/shared/types.ts` (Conversation interface)

9. **Remote Control URLs**
   - Extract and display `claude.ai/code` URLs from terminal output
   - Allow browser access to Claude session
   - Location in Dash: `src/main/services/RemoteControlService.ts`

## Git Operations

10. **Merge Base Into Branch**
    - Pull latest changes from base branch into worktree
    - Inverse of current "Merge to Base" operation
    - Location in Dash: `src/main/services/gitService.ts` (`mergeBaseIntoBranch`)

## Nice to Have

11. **Notification Sounds**
    - Audio alert when tasks complete
    - Configurable sound selection
    - Location in Dash: `src/renderer/hooks/useSettings.ts`

---

## Already Implemented

- [x] Fork Session (creates new task that forks source task's Claude context with `--continue --fork-session`)
- [x] New Session in Branch (creates new task in same branch with fresh context)

## Covered by VS Code

The following Dash features are already covered by VS Code or extensions:

- Commit graph visualization (GitLens, Git Graph extensions)
- Diff viewer (VS Code built-in)
- File changes panel (VS Code Source Control)
- Terminal themes (VS Code settings)
- Remote branch listing (VS Code Git integration)
- Merge conflict resolution (VS Code built-in)

## Not Needed

- SQLite database (JSON file storage is sufficient)
- Process-based activity polling (hook-based approach works well)
- Project management (VS Code workspaces handle this)
