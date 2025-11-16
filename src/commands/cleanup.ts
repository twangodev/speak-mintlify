/**
 * Cleanup command
 * Remove orphaned audio files from S3 that are no longer referenced in MDX files
 */

import ora from 'ora';
import chalk from 'chalk';
import type { CleanupOptions } from '../types/index.js';
import { resolveConfig } from '../core/config.js';
import { createS3Uploader } from '../core/s3-upload.js';
import { extractExistingAudioData } from '../core/injector.js';
import { findMDXFiles, readFile } from '../core/utils.js';

/**
 * Cleanup orphaned audio files from S3
 */
export async function cleanupCommand(
  directory: string,
  options: CleanupOptions
): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // Resolve configuration (only S3-related options needed)
    const config = await resolveConfig(options, directory);

    // Initialize S3 uploader
    spinner.text = 'Initializing S3 client...';
    const s3Uploader = createS3Uploader({
      bucket: config.s3Bucket,
      region: config.s3Region,
      endpoint: config.s3Endpoint,
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
      publicUrl: config.s3PublicUrl,
      pathPrefix: config.s3PathPrefix,
    });

    // Find MDX files
    spinner.text = 'Finding MDX files...';
    const files = await findMDXFiles(config.pattern, directory);

    if (files.length === 0) {
      spinner.warn(
        chalk.yellow(`No MDX files found matching pattern: ${config.pattern}`)
      );
      return;
    }

    spinner.succeed(chalk.green(`Found ${files.length} MDX file(s)`));

    // Scan MDX files and extract audio references
    spinner.start('Scanning MDX files for audio references...');
    const expectedKeys = new Set<string>();

    for (const file of files) {
      const filePath = `${directory}/${file}`;
      const content = await readFile(filePath);
      const existingData = await extractExistingAudioData(
        content,
        config.componentName
      );

      if (existingData && existingData.voices.length > 0) {
        // Extract S3 keys from voice URLs
        for (const voice of existingData.voices) {
          if (voice.url) {
            const key = s3Uploader.extractKeyFromUrl(
              voice.url,
              config.s3PublicUrl
            );
            expectedKeys.add(key);
          }
        }
      }
    }

    spinner.succeed(
      chalk.green(
        `Found ${expectedKeys.size} audio file(s) referenced in MDX files`
      )
    );

    // List all audio files in S3
    spinner.start('Listing audio files in S3...');
    const allS3Keys = await s3Uploader.listAllAudioFiles();
    spinner.succeed(chalk.green(`Found ${allS3Keys.length} audio file(s) in S3`));

    // Identify orphaned files
    const orphanedKeys = allS3Keys.filter((key) => !expectedKeys.has(key));

    if (orphanedKeys.length === 0) {
      spinner.succeed(chalk.green('No orphaned files found! S3 is clean.'));
      return;
    }

    // Display orphaned files
    console.log(
      chalk.yellow(`\nFound ${orphanedKeys.length} orphaned file(s):\n`)
    );

    for (const key of orphanedKeys) {
      console.log(chalk.gray(`  - ${key}`));
    }

    // Dry-run preview or actual deletion
    if (config.dryRun) {
      console.log(
        chalk.blue(
          `\nDry run complete. Run without --dry-run to delete these files.`
        )
      );
    } else {
      // Delete orphaned files
      spinner.start(`Deleting ${orphanedKeys.length} orphaned file(s)...`);
      await s3Uploader.deleteMultiple(orphanedKeys);
      spinner.succeed(
        chalk.green(`Deleted ${orphanedKeys.length} orphaned file(s)`)
      );

      // Print summary
      console.log('\n' + chalk.bold('Summary:'));
      console.log(chalk.gray(`  MDX files scanned: ${files.length}`));
      console.log(
        chalk.gray(`  Audio files referenced: ${expectedKeys.size}`)
      );
      console.log(chalk.gray(`  Total S3 files: ${allS3Keys.length}`));
      console.log(
        chalk.green(`  Orphaned files deleted: ${orphanedKeys.length}`)
      );
    }
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to cleanup S3'));
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}
