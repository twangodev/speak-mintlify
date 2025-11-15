/**
 * Configuration management
 * Unifies CLI options with environment variables
 */

import type { GenerateOptions } from '../types/index.js';

/**
 * Resolved configuration with env var fallbacks
 */
export interface ResolvedConfig {
  fishApiKey: string;
  voiceIds: string[];
  voiceNames: string[];
  s3Bucket: string;
  s3Region: string;
  s3Endpoint?: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3PublicUrl: string;
  s3PathPrefix: string;
  componentImport: string;
  componentName: string;
  pattern: string;
  dryRun: boolean;
  verbose: boolean;
}

/**
 * Resolve configuration from CLI options and environment variables
 * Priority: CLI flags > Environment variables > Defaults
 */
export function resolveConfig(
  options: GenerateOptions
): ResolvedConfig {
  // Parse voice IDs and names
  const voiceIds = options.voices.split(',').map((v) => v.trim());
  const voiceNames = options.voiceNames
    ? options.voiceNames.split(',').map((v) => v.trim())
    : voiceIds.map((_, i) => `Voice ${i + 1}`);

  if (voiceIds.length !== voiceNames.length) {
    throw new Error('Number of voice IDs must match number of voice names');
  }

  // Resolve all config values with priority: CLI > env > default
  const fishApiKey = options.apiKey || process.env.FISH_API_KEY;
  const s3Bucket = options.s3Bucket || process.env.S3_BUCKET;
  const s3AccessKeyId = options.s3AccessKeyId || process.env.S3_ACCESS_KEY_ID;
  const s3SecretAccessKey = options.s3SecretAccessKey || process.env.S3_SECRET_ACCESS_KEY;
  const s3PublicUrl = options.s3PublicUrl || process.env.S3_PUBLIC_URL;

  // Validate required fields
  const missing: string[] = [];
  if (!fishApiKey) missing.push('FISH_API_KEY (or --api-key)');
  if (!s3Bucket) missing.push('S3_BUCKET (or --s3-bucket)');
  if (!s3AccessKeyId) missing.push('S3_ACCESS_KEY_ID (or --s3-access-key-id)');
  if (!s3SecretAccessKey) missing.push('S3_SECRET_ACCESS_KEY (or --s3-secret-access-key)');
  if (!s3PublicUrl) missing.push('S3_PUBLIC_URL (or --s3-public-url)');

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration:\n  - ${missing.join('\n  - ')}\n\nSet these as environment variables or use CLI flags.`
    );
  }

  return {
    fishApiKey: fishApiKey!,
    voiceIds,
    voiceNames,
    s3Bucket: s3Bucket!,
    s3Region: options.s3Region || process.env.S3_REGION || 'us-east-1',
    s3Endpoint: options.s3Endpoint || process.env.S3_ENDPOINT,
    s3AccessKeyId: s3AccessKeyId!,
    s3SecretAccessKey: s3SecretAccessKey!,
    s3PublicUrl: s3PublicUrl!,
    s3PathPrefix: options.s3PathPrefix || 'audio',
    componentImport: options.componentImport || '/snippets/audio-transcript.jsx',
    componentName: options.componentName || 'AudioTranscript',
    pattern: options.pattern || '**/*.mdx',
    dryRun: options.dryRun || false,
    verbose: options.verbose || false,
  };
}