import { exec } from '../utils/gitUtils';

export interface GitStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

interface CacheEntry {
  stats: GitStats | null;
  timestamp: number;
}

/**
 * Service to fetch and cache git diff statistics for worktrees.
 * Provides lightweight, non-blocking stats fetching with automatic caching.
 */
export class GitStatsService {
  private cache = new Map<string, CacheEntry>();
  private pendingFetches = new Map<string, Promise<GitStats | null>>();

  // Cache TTL in milliseconds (30 seconds)
  private readonly CACHE_TTL = 30 * 1000;

  /**
   * Get cached git stats for a worktree path.
   * Returns null if no cached data exists or if path is null.
   * Use fetchStats() to trigger a fetch.
   */
  getCachedStats(worktreePath: string | null): GitStats | null {
    if (!worktreePath) return null;

    const entry = this.cache.get(worktreePath);
    if (!entry) return null;

    // Check if cache is still valid
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      return null;
    }

    return entry.stats;
  }

  /**
   * Fetch git stats for a worktree path asynchronously.
   * Results are cached. Multiple concurrent requests for the same path
   * are deduplicated.
   */
  async fetchStats(worktreePath: string | null): Promise<GitStats | null> {
    if (!worktreePath) return null;

    // Check cache first
    const cached = this.getCachedStats(worktreePath);
    if (cached !== null) return cached;

    // Check if there's already a pending fetch for this path
    const pending = this.pendingFetches.get(worktreePath);
    if (pending) return pending;

    // Start new fetch
    const fetchPromise = this.doFetchStats(worktreePath);
    this.pendingFetches.set(worktreePath, fetchPromise);

    try {
      const result = await fetchPromise;
      this.cache.set(worktreePath, {
        stats: result,
        timestamp: Date.now(),
      });
      return result;
    } finally {
      this.pendingFetches.delete(worktreePath);
    }
  }

  /**
   * Invalidate cache for a specific path or all paths.
   */
  invalidate(worktreePath?: string): void {
    if (worktreePath) {
      this.cache.delete(worktreePath);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Refresh stats for all cached paths.
   * Useful when the tree refreshes.
   */
  async refreshAll(): Promise<void> {
    const paths = Array.from(this.cache.keys());
    await Promise.all(paths.map((p) => this.fetchStats(p)));
  }

  private async doFetchStats(worktreePath: string): Promise<GitStats | null> {
    try {
      // Use git diff --shortstat for a quick summary of uncommitted changes
      // This shows both staged and unstaged changes
      const { stdout } = await exec('git', ['diff', 'HEAD', '--shortstat'], {
        cwd: worktreePath,
        timeout: 5000, // 5 second timeout
      });

      return this.parseShortstat(stdout);
    } catch {
      // Handle various error cases gracefully:
      // - Not a git repo
      // - No commits yet (HEAD doesn't exist)
      // - Path doesn't exist
      // - Git not installed

      // Try without HEAD (for repos with no commits)
      try {
        const { stdout } = await exec('git', ['diff', '--shortstat'], {
          cwd: worktreePath,
          timeout: 5000,
        });
        return this.parseShortstat(stdout);
      } catch {
        return null;
      }
    }
  }

  /**
   * Parse git diff --shortstat output.
   * Example output: " 3 files changed, 42 insertions(+), 15 deletions(-)"
   */
  private parseShortstat(output: string): GitStats | null {
    const trimmed = output.trim();
    if (!trimmed) {
      // No changes
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    // Match "N file(s) changed"
    const filesMatch = trimmed.match(/(\d+)\s+files?\s+changed/);
    if (filesMatch) {
      filesChanged = parseInt(filesMatch[1], 10);
    }

    // Match "N insertions(+)"
    const insertionsMatch = trimmed.match(/(\d+)\s+insertions?\(\+\)/);
    if (insertionsMatch) {
      insertions = parseInt(insertionsMatch[1], 10);
    }

    // Match "N deletions(-)"
    const deletionsMatch = trimmed.match(/(\d+)\s+deletions?\(-\)/);
    if (deletionsMatch) {
      deletions = parseInt(deletionsMatch[1], 10);
    }

    return { filesChanged, insertions, deletions };
  }

  /**
   * Format stats for display in tree item description.
   * Returns empty string if no changes or no stats.
   */
  formatStats(stats: GitStats | null): string {
    if (!stats) return '';
    if (stats.filesChanged === 0) return '';

    // Format as "+42 -15" for insertions/deletions
    const parts: string[] = [];
    if (stats.insertions > 0) {
      parts.push(`+${stats.insertions}`);
    }
    if (stats.deletions > 0) {
      parts.push(`-${stats.deletions}`);
    }

    // If no insertions or deletions but files changed, show file count
    if (parts.length === 0 && stats.filesChanged > 0) {
      return `${stats.filesChanged} file${stats.filesChanged > 1 ? 's' : ''}`;
    }

    return parts.join(' ');
  }
}
