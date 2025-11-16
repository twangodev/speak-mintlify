/**
 * Configuration validators
 * Each command can import and use the validators it needs
 */

import type { ResolvedConfig } from './config.js';

/**
 * Validate configuration for generate command
 * Throws if required fields are missing or invalid
 */
export function validateGenerateConfig(config: ResolvedConfig): void {
  const errors: string[] = [];

  // Check Fish API key
  if (!config.fishApiKey) {
    errors.push('FISH_API_KEY (--api-key or env var)');
  }

  // Check voices
  if (!config.voiceIds || config.voiceIds.length === 0) {
    errors.push('Voices (--voices flag or speaker-config.yaml)');
  }

  if (!config.voiceNames || config.voiceNames.length === 0) {
    errors.push('Voice names (--voice-names flag or speaker-config.yaml)');
  }

  // Check voice arrays match in length
  if (config.voiceIds && config.voiceNames) {
    if (config.voiceIds.length !== config.voiceNames.length) {
      errors.push(
        `Voice IDs and names must have the same length (got ${config.voiceIds.length} IDs and ${config.voiceNames.length} names)`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Missing or invalid configuration for generate command:\n  - ${errors.join('\n  - ')}\n\nSet these via CLI flags, environment variables, or speaker-config.yaml.`
    );
  }
}

/**
 * Validate configuration for cleanup command
 * Currently cleanup only needs S3 config which is always validated in resolveConfig
 * This is a placeholder for any future cleanup-specific validation
 */
export function validateCleanupConfig(config: ResolvedConfig): void {
  // S3 fields are already validated in resolveConfig
  // No additional validation needed for cleanup
}