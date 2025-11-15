/**
 * S3-Compatible Storage Uploader
 * Handles uploads to AWS S3, Cloudflare R2, MinIO, etc.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import type { S3Config } from '../types/index.js';

/**
 * S3 Uploader for audio files
 */
export class S3Uploader {
  private client: S3Client;
  private config: S3Config;
  private branch: string;

  constructor(config: S3Config, branch: string = 'main') {
    this.config = config;
    this.branch = branch;

    // Create S3 client with optional custom endpoint (for R2, MinIO, etc.)
    this.client = new S3Client({
      region: config.region || 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Generate S3 key (path) for audio file
   * Includes branch name for CI/CD multi-branch support
   * @param filePath - Original MDX file path
   * @param voiceId - Voice ID
   * @returns S3 object key
   */
  private generateKey(filePath: string, voiceId: string): string {
    // Generate slug from file path
    // Example: "developer-guide/getting-started/introduction.mdx"
    // → "getting-started-introduction"
    const slug = filePath
      .replace(/\.mdx$/, '')
      .split('/')
      .slice(-2)
      .join('-')
      .toLowerCase();

    const prefix = this.config.pathPrefix || 'audio';
    // Include branch name: audio/{branch}/{slug}/{voiceId}.mp3
    return `${prefix}/${this.branch}/${slug}/${voiceId}.mp3`;
  }

  /**
   * Upload audio file to S3
   * @param audioBuffer - MP3 audio buffer
   * @param filePath - Original MDX file path
   * @param voiceId - Voice ID
   * @returns Public URL to the uploaded file
   */
  async uploadAudio(
    audioBuffer: Buffer,
    filePath: string,
    voiceId: string
  ): Promise<string> {
    const key = this.generateKey(filePath, voiceId);

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
      // ACL is deprecated in newer S3 implementations
      // Use bucket policies instead for public access
    });

    await this.client.send(command);

    // Return public URL
    const publicUrl = this.config.publicUrl.replace(/\/$/, '');
    return `${publicUrl}/${key}`;
  }

  /**
   * Upload multiple audio files for different voices
   * @param audioMap - Map of voice ID to audio buffer
   * @param filePath - Original MDX file path
   * @returns Map of voice ID to public URL
   */
  async uploadMultipleVoices(
    audioMap: Map<string, Buffer>,
    filePath: string
  ): Promise<Map<string, string>> {
    const results = await Promise.all(
      Array.from(audioMap.entries()).map(async ([voiceId, buffer]) => {
        const url = await this.uploadAudio(buffer, filePath, voiceId);
        return { voiceId, url };
      })
    );

    return new Map(results.map((r) => [r.voiceId, r.url]));
  }
}

/**
 * Create an S3 uploader instance
 * @param config - S3 configuration
 * @param branch - Git branch name (for path prefix)
 */
export function createS3Uploader(config: S3Config, branch: string = 'main'): S3Uploader {
  return new S3Uploader(config, branch);
}