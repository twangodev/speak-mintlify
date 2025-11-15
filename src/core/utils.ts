/**
 * Utility functions
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

/**
 * Default ignore patterns
 */
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  'dist/**',
  '.git/**',
  'snippets/**',
];

/**
 * Load ignore patterns from .speakignore file
 * @param cwd - Current working directory
 * @returns Array of ignore patterns
 */
async function loadSpeakIgnore(cwd: string): Promise<string[]> {
  const speakIgnorePath = path.join(cwd, '.speakignore');

  try {
    const content = await fs.readFile(speakIgnorePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // Remove comments and empty lines
  } catch {
    // .speakignore doesn't exist, return empty array
    return [];
  }
}

/**
 * Find MDX files matching pattern
 * @param pattern - Glob pattern for MDX files
 * @param cwd - Current working directory
 * @returns Array of file paths
 */
export async function findMDXFiles(
  pattern: string = '**/*.mdx',
  cwd: string = process.cwd()
): Promise<string[]> {
  // Load custom ignore patterns from .speakignore
  const customIgnores = await loadSpeakIgnore(cwd);

  // Combine default and custom ignore patterns
  const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...customIgnores];

  const files = await glob(pattern, {
    cwd,
    ignore: ignorePatterns,
  });

  return files;
}

/**
 * Read file content
 * @param filePath - Path to file
 * @returns File content as string
 */
export async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Write file content
 * @param filePath - Path to file
 * @param content - Content to write
 */
export async function writeFile(
  filePath: string,
  content: string
): Promise<void> {
  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Check if file exists
 * @param filePath - Path to file
 * @returns True if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}