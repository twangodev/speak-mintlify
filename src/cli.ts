#!/usr/bin/env node

/**
 * speak-mintlify CLI
 * Generate TTS audio for Mintlify documentation using Fish Audio
 */

try {
  process.loadEnvFile();
} catch {}

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateCommand } from './commands/generate.js';
import { cleanupCommand } from './commands/cleanup.js';
import type { GenerateOptions, CleanupOptions } from './types/index.js';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('speak-mintlify')
  .description('Generate TTS audio for Mintlify documentation using Fish Audio')
  .version(packageJson.version);

program
  .command('generate')
  .description('Generate TTS audio for MDX documentation files')
  .argument('[directory]', 'Directory containing MDX files', '.')
  .option(
    '--voices <ids>',
    'Comma-separated list of Fish Audio voice IDs (or use speaker-config.yaml)'
  )
  .option(
    '--voice-names <names>',
    'Comma-separated list of voice names (must match number of voice IDs)'
  )
  .option('--api-key <key>', 'Fish Audio API key (or use FISH_API_KEY env var)')
  .option('--s3-bucket <bucket>', 'S3 bucket name (or use S3_BUCKET env var)')
  .option('--s3-region <region>', 'S3 region (or use S3_REGION env var, default: us-east-1)')
  .option(
    '--s3-endpoint <url>',
    'S3 endpoint URL (or use S3_ENDPOINT env var - for R2, MinIO, etc.)'
  )
  .option(
    '--s3-access-key-id <key>',
    'S3 access key ID (or use S3_ACCESS_KEY_ID env var)'
  )
  .option(
    '--s3-secret-access-key <key>',
    'S3 secret access key (or use S3_SECRET_ACCESS_KEY env var)'
  )
  .option(
    '--s3-public-url <url>',
    'Public CDN URL for accessing files (or use S3_PUBLIC_URL env var)'
  )
  .option(
    '--s3-path-prefix <prefix>',
    'S3 path prefix for audio files (default: audio)',
    'audio'
  )
  .option(
    '--component-import <path>',
    'Import path for audio player component',
    '/snippets/audio-transcript.jsx'
  )
  .option(
    '--component-name <name>',
    'Name of the audio player component',
    'AudioTranscript'
  )
  .option(
    '--pattern <glob>',
    'Glob pattern for MDX files to process',
    '**/*.mdx'
  )
  .option('--dry-run', 'Simulate without making actual changes', false)
  .option('--verbose', 'Show detailed processing information', false)
  .action(async (directory: string, options: GenerateOptions) => {
    try {
      await generateCommand(directory, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('cleanup')
  .description('Remove orphaned audio files from S3')
  .argument('[directory]', 'Directory containing MDX files', '.')
  .option('--s3-bucket <bucket>', 'S3 bucket name (or use S3_BUCKET env var)')
  .option('--s3-region <region>', 'S3 region (or use S3_REGION env var, default: us-east-1)')
  .option(
    '--s3-endpoint <url>',
    'S3 endpoint URL (or use S3_ENDPOINT env var - for R2, MinIO, etc.)'
  )
  .option(
    '--s3-access-key-id <key>',
    'S3 access key ID (or use S3_ACCESS_KEY_ID env var)'
  )
  .option(
    '--s3-secret-access-key <key>',
    'S3 secret access key (or use S3_SECRET_ACCESS_KEY env var)'
  )
  .option(
    '--s3-public-url <url>',
    'Public CDN URL for accessing files (or use S3_PUBLIC_URL env var)'
  )
  .option(
    '--s3-path-prefix <prefix>',
    'S3 path prefix for audio files (default: audio)',
    'audio'
  )
  .option(
    '--component-name <name>',
    'Name of the audio player component',
    'AudioTranscript'
  )
  .option(
    '--pattern <glob>',
    'Glob pattern for MDX files to process',
    '**/*.mdx'
  )
  .option('--dry-run', 'Preview orphaned files without deleting', false)
  .option('--verbose', 'Show detailed information', false)
  .action(async (directory: string, options: CleanupOptions) => {
    try {
      await cleanupCommand(directory, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();