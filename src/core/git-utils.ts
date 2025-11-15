/**
 * Git utilities
 * Helper functions for git operations
 */

import { simpleGit } from 'simple-git';

/**
 * Get the current git branch name
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Branch name or 'main' as fallback
 */
export async function getCurrentBranch(cwd?: string): Promise<string> {
  try {
    const git = simpleGit(cwd);
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim() || 'main';
  } catch {
    // Not a git repo or git not available
    return 'main';
  }
}