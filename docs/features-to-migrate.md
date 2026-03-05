# Features to Migrate from Dash to Swarm

This document tracks features from the Dash Electron app (`/opt/ed/dash`) that should be ported to the Swarm VS Code extension.

## Priority Features

1. ~~**`--fork-session` flag**~~ ❌ NOT NEEDED
   - Decided against implementing - fresh context is preferred behavior

2. ~~**Task Archiving**~~ ✅ IMPLEMENTED
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
   - **See: [command-library-implementation.md](./command-library-implementation.md)** for detailed implementation plan

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

10. ~~**Merge Base Into Branch**~~ ✅ IMPLEMENTED
    - Pull latest changes from base branch into worktree
    - Inverse of current "Merge to Base" operation
    - Location in Dash: `src/main/services/gitService.ts` (`mergeBaseIntoBranch`)

## Nice to Have

11. ~~**Notification Sounds**~~ ✅ IMPLEMENTED
    - Audio alert when tasks complete
    - Configurable sound selection
    - Location in Dash: `src/renderer/hooks/useSettings.ts`

---

## Covered by VS Code

The following features are already covered by VS Code or extensions:

- Commit graph visualization (GitLens, Git Graph extensions)
- Diff viewer (VS Code built-in)
- File changes panel (VS Code Source Control)
- Terminal themes (VS Code settings)
- Remote branch listing (VS Code Git integration)
- Merge conflict resolution (VS Code built-in)
