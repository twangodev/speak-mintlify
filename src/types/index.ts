/**
 * Type definitions for speak-mintlify CLI
 */

/**
 * Voice configuration for TTS generation
 */
export interface Voice {
  id: string;
  name: string;
  url?: string;
}

/**
 * Audio metadata stored for each file
 */
export interface AudioMetadata {
  hash: string;
  lastUpdated: string;
  voices: Voice[];
}

/**
 * Metadata file structure
 */
export interface MetadataFile {
  [filePath: string]: AudioMetadata;
}

/**
 * S3-compatible storage configuration
 */
export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string; // Custom endpoint for R2, MinIO, etc.
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string; // CDN URL for accessing files
  pathPrefix?: string; // Optional prefix like "audio/"
}

/**
 * Configuration for TTS generation
 */
export interface TTSConfig {
  fishApiKey: string;
  voiceIds: string[];
  voiceNames?: string[];
  s3Config: S3Config;
  componentImport?: string;
  componentName?: string;
}

/**
 * Fish Audio API request parameters
 */
export interface FishAudioRequest {
  text: string;
  reference_id: string;
  format?: string;
  mp3_bitrate?: number;
  opus_bitrate?: number;
  latency?: 'normal' | 'balanced';
  streaming?: boolean;
}

/**
 * Result of processing a single file
 */
export interface ProcessingResult {
  file: string;
  success: boolean;
  voices: Voice[];
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * CLI command options for generate command
 */
export interface GenerateOptions {
  apiKey?: string;
  voices?: string; // Optional - can come from speaker-config.yaml
  voiceNames?: string;
  s3Bucket?: string; // Optional - can come from speaker-config.yaml
  s3Region?: string;
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3PublicUrl?: string; // Optional - can come from speaker-config.yaml
  s3PathPrefix?: string;
  componentImport?: string;
  componentName?: string;
  pattern?: string;
  dryRun?: boolean;
  verbose?: boolean;
}
