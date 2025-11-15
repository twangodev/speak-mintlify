/**
 * Content Hash Tracker
 * Manages content hashing and metadata to detect changes
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { MetadataFile, AudioMetadata } from '../types/index.js';

const METADATA_FILENAME = '.audio-metadata.json';

/**
 * Generate SHA-256 hash of content
 * @param content - Text content to hash
 * @returns Hex-encoded hash string
 */
export function generateHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Load metadata file from directory
 * @param directory - Directory containing metadata file
 * @returns Metadata object or empty object if file doesn't exist
 */
export async function loadMetadata(directory: string): Promise<MetadataFile> {
  const metadataPath = path.join(directory, METADATA_FILENAME);

  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    // If file doesn't exist, return empty metadata
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Save metadata file to directory
 * @param directory - Directory to save metadata file
 * @param metadata - Metadata object to save
 */
export async function saveMetadata(
  directory: string,
  metadata: MetadataFile
): Promise<void> {
  const metadataPath = path.join(directory, METADATA_FILENAME);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Check if content has changed based on hash
 * @param filePath - Relative file path
 * @param newHash - New content hash
 * @param metadata - Existing metadata
 * @returns True if content has changed or file is new
 */
export function hasContentChanged(
  filePath: string,
  newHash: string,
  metadata: MetadataFile
): boolean {
  // File not in metadata = new file
  if (!metadata[filePath]) {
    return true;
  }

  // Hash differs = content changed
  if (metadata[filePath]?.hash !== newHash) {
    return true;
  }

  // Same hash = no change
  return false;
}

/**
 * Update metadata for a file
 * @param metadata - Metadata object to update
 * @param filePath - Relative file path
 * @param hash - Content hash
 * @param voices - Voice configurations with URLs
 */
export function updateMetadata(
  metadata: MetadataFile,
  filePath: string,
  hash: string,
  voices: Array<{ id: string; name: string; url: string }>
): void {
  metadata[filePath] = {
    hash,
    lastUpdated: new Date().toISOString(),
    voices: voices.map(v => ({ id: v.id, name: v.name, url: v.url })),
  };
}

/**
 * Get metadata for a specific file
 * @param metadata - Metadata object
 * @param filePath - Relative file path
 * @returns Metadata for the file or undefined if not found
 */
export function getFileMetadata(
  metadata: MetadataFile,
  filePath: string
): AudioMetadata | undefined {
  return metadata[filePath];
}