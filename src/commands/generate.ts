/**
 * Generate command
 * Main CLI command to generate TTS audio for documentation
 */

import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import * as Diff from 'diff';
import type { GenerateOptions, ProcessingResult, Voice } from '../types/index.js';
import { resolveConfig } from '../core/config.js';
import { extractCleanText } from '../core/extractor.js';
import {
  generateHash,
  loadMetadata,
  saveMetadata,
  hasContentChanged,
  updateMetadata,
} from '../core/hash-tracker.js';
import { createFishAudioClient } from '../core/fish-api.js';
import { createS3Uploader } from '../core/s3-upload.js';
import { injectAudioComponent, extractExistingAudioData } from '../core/injector.js';
import { findMDXFiles, readFile, writeFile } from '../core/utils.js';
import { getCurrentBranch } from '../core/git-utils.js';

/**
 * Generate TTS audio for documentation files
 */
export async function generateCommand(
  directory: string,
  options: GenerateOptions
): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // Resolve configuration from CLI options and environment variables
    const config = resolveConfig(options);

    // Get current git branch for S3 path organization
    const gitBranch = await getCurrentBranch(directory);
    spinner.text = `Detected git branch: ${gitBranch}`;

    // Initialize clients
    spinner.text = 'Initializing Fish Audio client...';
    const fishClient = createFishAudioClient(config.fishApiKey);

    spinner.text = 'Initializing S3 uploader...';
    const s3Uploader = createS3Uploader({
      bucket: config.s3Bucket,
      region: config.s3Region,
      endpoint: config.s3Endpoint,
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
      publicUrl: config.s3PublicUrl,
      pathPrefix: config.s3PathPrefix,
    }, gitBranch);

    // Find MDX files
    spinner.text = 'Finding MDX files...';
    const files = await findMDXFiles(config.pattern, directory);

    if (files.length === 0) {
      spinner.warn(chalk.yellow(`No MDX files found matching pattern: ${config.pattern}`));
      return;
    }

    spinner.succeed(chalk.green(`Found ${files.length} MDX file(s)`));

    // Load metadata
    const metadata = await loadMetadata(directory);

    // Process each file
    const results: ProcessingResult[] = [];

    for (const file of files) {
      const fileSpinner = ora(`Processing ${chalk.cyan(file)}...`).start();

      try {
        const filePath = path.join(directory, file);
        const content = await readFile(filePath);

        // Extract clean text
        fileSpinner.text = `Extracting text from ${chalk.cyan(file)}...`;
        const cleanText = await extractCleanText(content);

        if (!cleanText.trim()) {
          fileSpinner.warn(
            chalk.yellow(`Skipping ${file} - no extractable text`)
          );
          results.push({
            file,
            success: true,
            voices: [],
            skipped: true,
            reason: 'No extractable text',
          });
          continue;
        }

        // Generate hash of clean text
        const hash = generateHash(cleanText);

        // Log extracted text in verbose mode
        if (config.verbose) {
          fileSpinner.stop();
          console.log(chalk.cyan(`\n  ━━━ Extracted Text for TTS (${cleanText.length} chars) ━━━`));
          console.log(chalk.white(cleanText));
          console.log(chalk.cyan(`  ━━━ Hash: ${hash} ━━━\n`));
          fileSpinner.start();
        }

        // Check if file already has audio component with hash
        const existingData = await extractExistingAudioData(content, config.componentName);

        // If component exists with matching hash and voice IDs, skip
        if (existingData) {
          const hashMatches = existingData.hash === hash;
          const voicesMatch =
            existingData.voiceIds.length === config.voiceIds.length &&
            config.voiceIds.every(id => existingData.voiceIds.includes(id));

          if (hashMatches && voicesMatch) {
            fileSpinner.info(
              chalk.gray(`Skipping ${file} - content unchanged (hash in MDX)`)
            );
            results.push({
              file,
              success: true,
              voices: existingData.voices,
              skipped: true,
              reason: 'Content unchanged',
            });
            continue;
          }
        }

        if (config.dryRun) {
          // Generate slug from file path (same as S3 uploader)
          const slug = file
            .replace(/\.mdx$/, '')
            .split('/')
            .slice(-2)
            .join('-')
            .toLowerCase();

          // Create mock voice data for preview with actual public URL (including branch)
          const mockVoices: Array<{ id: string; name: string; url: string }> = config.voiceIds.map((id, idx) => ({
            id,
            name: config.voiceNames[idx] || `Voice ${idx + 1}`,
            url: `${config.s3PublicUrl.replace(/\/$/, '')}/${config.s3PathPrefix}/${gitBranch}/${slug}/${id}.mp3`,
          }));

          // Generate what the component would look like
          const updatedContent = await injectAudioComponent(content, mockVoices, hash, {
            componentImport: config.componentImport,
            componentName: config.componentName,
          });

          // Show diff
          const diff = Diff.createPatch(file, content, updatedContent, '', '');
          const diffLines = diff.split('\n').slice(4); // Skip header lines

          fileSpinner.info(chalk.blue(`[DRY RUN] ${file}`));

          console.log(chalk.gray('\n  Changes that would be made:'));
          for (const line of diffLines) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
              console.log(chalk.green('  ' + line));
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              console.log(chalk.red('  ' + line));
            } else if (line.startsWith('@@')) {
              console.log(chalk.cyan('  ' + line));
            }
          }
          console.log('');

          results.push({
            file,
            success: true,
            voices: mockVoices,
            skipped: true,
            reason: 'Dry run',
          });
          continue;
        }

        // Generate TTS for all voices
        fileSpinner.text = `Generating TTS for ${chalk.cyan(file)} (${config.voiceIds.length} voices)...`;
        const audioBuffers = await fishClient.generateMultipleVoices(
          cleanText,
          config.voiceIds
        );

        // Upload to S3
        fileSpinner.text = `Uploading audio for ${chalk.cyan(file)}...`;
        const audioUrls = await s3Uploader.uploadMultipleVoices(
          audioBuffers,
          file
        );

        // Create voice array with URLs
        const voices: Array<{ id: string; name: string; url: string }> = config.voiceIds.map((id, idx) => ({
          id,
          name: config.voiceNames[idx] || `Voice ${idx + 1}`,
          url: audioUrls.get(id) || '',
        }));

        // Inject audio component with hash
        fileSpinner.text = `Injecting audio component into ${chalk.cyan(file)}...`;
        const updatedContent = await injectAudioComponent(content, voices, hash, {
          componentImport: config.componentImport,
          componentName: config.componentName,
        });

        // Write updated file
        await writeFile(filePath, updatedContent);

        // Update metadata
        updateMetadata(metadata, file, hash, voices);

        fileSpinner.succeed(
          chalk.green(`✓ Generated TTS for ${chalk.cyan(file)}`)
        );

        results.push({
          file,
          success: true,
          voices,
        });
      } catch (error: any) {
        fileSpinner.fail(chalk.red(`✗ Failed to process ${file}`));
        console.error(chalk.red(`  Error: ${error.message}`));

        results.push({
          file,
          success: false,
          voices: [],
          error: error.message,
        });
      }
    }

    // Save metadata
    if (!config.dryRun) {
      await saveMetadata(directory, metadata);
    }

    // Print summary
    console.log('\n' + chalk.bold('Summary:'));
    const successful = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(chalk.green(`  ✓ Successfully processed: ${successful}`));
    console.log(chalk.gray(`  ⊘ Skipped: ${skipped}`));
    if (failed > 0) {
      console.log(chalk.red(`  ✗ Failed: ${failed}`));
    }

    if (config.verbose) {
      console.log('\n' + chalk.bold('Details:'));
      for (const result of results) {
        if (result.skipped) {
          console.log(chalk.gray(`  ${result.file}: ${result.reason}`));
        } else if (result.success) {
          console.log(
            chalk.green(
              `  ${result.file}: ${result.voices.length} voice(s) generated`
            )
          );
        } else {
          console.log(chalk.red(`  ${result.file}: ${result.error}`));
        }
      }
    }
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to generate TTS'));
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}