/**
 * Configuration management
 * Unifies CLI options, environment variables, and YAML config
 * Priority: CLI flags > Environment variables > YAML config > Defaults
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import type { GenerateOptions } from '../types/index.js';

/**
 * Speaker config from YAML file (no secrets)
 */
interface SpeakerConfig {
  voices?: Record<string, string>; // Map of voice ID to voice name
  component?: {
    import?: string;
    name?: string;
  };
}

/**
 * Load speaker config from YAML file
 */
async function loadSpeakerConfig(directory: string): Promise<SpeakerConfig> {
  const configPath = path.join(directory, 'speaker-config.yaml');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(content) as SpeakerConfig;
    return config || {};
  } catch {
    // Config file doesn't exist or invalid, return empty
    return {};
  }
}

/**
 * Resolved configuration with env var fallbacks
 */
export interface ResolvedConfig {
  // Generation specific
  fishApiKey?: string;
  voiceIds?: string[];
  voiceNames?: string[];

  // Required
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
 * Resolve configuration from CLI options, environment variables, and YAML
 * Priority: CLI flags > Environment variables > YAML config > Defaults
 */
export async function resolveConfig(
  options: GenerateOptions,
  directory: string
): Promise<ResolvedConfig> {
  // Load YAML config
  const yamlConfig = await loadSpeakerConfig(directory);

  // Parse voice IDs and names with priority: CLI > YAML (optional)
  let voiceIds: string[] | undefined;
  let voiceNames: string[] | undefined;

  if (options.voices) {
    // From CLI
    voiceIds = options.voices.split(',').map((v) => v.trim());
    voiceNames = options.voiceNames
      ? options.voiceNames.split(',').map((v) => v.trim())
      : voiceIds.map((_, i) => `Voice ${i + 1}`);
  } else if (yamlConfig.voices) {
    // From YAML (map of id -> name)
    voiceIds = Object.keys(yamlConfig.voices);
    voiceNames = Object.values(yamlConfig.voices);
  }

  // Resolve all config values with priority: CLI > env
  const fishApiKey = options.apiKey || process.env.FISH_API_KEY;
  const s3Bucket = options.s3Bucket || process.env.S3_BUCKET;
  const s3AccessKeyId = options.s3AccessKeyId || process.env.S3_ACCESS_KEY_ID;
  const s3SecretAccessKey = options.s3SecretAccessKey || process.env.S3_SECRET_ACCESS_KEY;
  const s3PublicUrl = options.s3PublicUrl || process.env.S3_PUBLIC_URL;

  // Validate only S3 fields (always required)
  const missing: string[] = [];
  if (!s3Bucket) missing.push('S3_BUCKET (--s3-bucket or env var)');
  if (!s3AccessKeyId) missing.push('S3_ACCESS_KEY_ID (--s3-access-key-id or env var)');
  if (!s3SecretAccessKey) missing.push('S3_SECRET_ACCESS_KEY (--s3-secret-access-key or env var)');
  if (!s3PublicUrl) missing.push('S3_PUBLIC_URL (--s3-public-url or env var)');

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration:\n  - ${missing.join('\n  - ')}\n\nSet these via CLI flags or environment variables.`
    );
  }

  return {
    // Optional fields
    fishApiKey,
    voiceIds,
    voiceNames,

    // Always required S3 fields
    s3AccessKeyId: s3AccessKeyId!,
    s3SecretAccessKey: s3SecretAccessKey!,
    s3Bucket: s3Bucket!,
    s3PublicUrl: s3PublicUrl!,
    s3Region: options.s3Region || process.env.S3_REGION || 'us-east-1',
    s3Endpoint: options.s3Endpoint || process.env.S3_ENDPOINT,
    s3PathPrefix: options.s3PathPrefix || 'audio',

    // Component/pattern config
    componentImport: options.componentImport || yamlConfig.component?.import || '/snippets/audio-transcript.jsx',
    componentName: options.componentName || yamlConfig.component?.name || 'AudioTranscript',
    pattern: options.pattern || '**/*.mdx',
    dryRun: options.dryRun || false,
    verbose: options.verbose || false,
  };
}