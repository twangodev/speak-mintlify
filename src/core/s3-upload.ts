/**
 * S3-Compatible Storage Uploader
 * Handles uploads to AWS S3, Cloudflare R2, MinIO, etc.
 */

import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import type { S3Config } from '../types/index.js';

/**
 * S3 Uploader for audio files
 */
export class S3Uploader {
  private client: S3Client;
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;

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
    return `${prefix}/${slug}/${voiceId}.mp3`;
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

  /**
   * List all audio files in S3 with the configured prefix
   * @returns Array of S3 object keys
   */
  async listAllAudioFiles(): Promise<string[]> {
    const prefix = this.config.pathPrefix || 'audio';
    const allKeys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix + '/',
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        allKeys.push(
          ...response.Contents.map((obj) => obj.Key).filter(
            (key): key is string => key !== undefined
          )
        );
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return allKeys;
  }

  /**
   * Delete multiple files from S3
   * @param keys - Array of S3 object keys to delete
   */
  async deleteMultiple(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    // S3 allows deleting up to 1000 objects at once
    const batchSize = 1000;

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      const command = new DeleteObjectsCommand({
        Bucket: this.config.bucket,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
          Quiet: false,
        },
      });

      await this.client.send(command);
    }
  }

  /**
   * Extract S3 key from public URL
   * @param url - Public URL (e.g., https://cdn.example.com/audio/file/voice.mp3)
   * @param publicUrl - Public URL base (e.g., https://cdn.example.com)
   * @returns S3 key (e.g., audio/file/voice.mp3)
   */
  extractKeyFromUrl(url: string, publicUrl?: string): string {
    const baseUrl = (publicUrl || this.config.publicUrl).replace(/\/$/, '');

    // Remove the base URL to get the key
    if (url.startsWith(baseUrl)) {
      return url.substring(baseUrl.length + 1); // +1 to remove leading slash
    }

    // If URL doesn't match base, try to extract just the path
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading slash
    } catch {
      // If not a valid URL, return as-is
      return url;
    }
  }
}

/**
 * Create an S3 uploader instance
 */
export function createS3Uploader(config: S3Config): S3Uploader {
  return new S3Uploader(config);
}