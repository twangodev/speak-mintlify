/**
 * Generate command
 * Main CLI command to generate TTS audio for documentation
 */

import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import * as Diff from 'diff';
import type { GenerateOptions, ProcessingResult, Voice } from '../types/index.js';
import { resolveConfig, type ResolvedConfig } from '../core/config.js';
import { extractCleanText } from '../core/extractor.js';
import { generateHash } from '../core/hash-tracker.js';
import { createFishAudioClient } from '../core/fish-api.js';
import { createS3Uploader } from '../core/s3-upload.js';
import { injectAudioComponent, extractExistingAudioData } from '../core/injector.js';
import { findMDXFiles, readFile, writeFile } from '../core/utils.js';

/**
 * Validate configuration for generate command
 * Throws if required fields are missing
 */
function validateGenerateConfig(config: ResolvedConfig): void {
  const missing: string[] = [];
  if (!config.fishApiKey) missing.push('FISH_API_KEY (--api-key or env var)');
  if (!config.voiceIds || config.voiceIds.length === 0) {
    missing.push('Voices (--voices flag or speaker-config.yaml)');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration:\n  - ${missing.join('\n  - ')}\n\nSet these via CLI flags, environment variables, or speaker-config.yaml.`
    );
  }
}

/**
 * Generate TTS audio for documentation files
 */
export async function generateCommand(
  directory: string,
  options: GenerateOptions
): Promise<void> {
  const spinner = ora('Initializing...').start();

  try {
    // Resolve configuration from CLI options, environment variables, and YAML
    const config = await resolveConfig(options, directory);

    validateGenerateConfig(config);

    // Initialize clients
    spinner.text = 'Initializing Fish Audio client...';
    const fishClient = createFishAudioClient(config.fishApiKey!);

    spinner.text = 'Initializing S3 uploader...';
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
      spinner.warn(chalk.yellow(`No MDX files found matching pattern: ${config.pattern}`));
      return;
    }

    spinner.succeed(chalk.green(`Found ${files.length} MDX file(s)`));

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
            existingData.voiceIds.length === config.voiceIds!.length &&
            config.voiceIds!.every(id => existingData.voiceIds.includes(id));

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

          // Create mock voice data for preview with actual public URL
          const mockVoices: Array<{ id: string; name: string; url: string }> = config.voiceIds!.map((id, idx) => ({
            id,
            name: config.voiceNames![idx] || `Voice ${idx + 1}`,
            url: `${config.s3PublicUrl.replace(/\/$/, '')}/${config.s3PathPrefix}/${slug}/${id}.mp3`,
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

        // Generate TTS for each voice with progress
        const audioBuffers = new Map<string, Buffer>();
        const audioUrls = new Map<string, string>();

        for (let i = 0; i < config.voiceIds!.length; i++) {
          const voiceId = config.voiceIds![i]!;
          const voiceName = config.voiceNames![i] || `Voice ${i + 1}`;

          // Generate TTS
          fileSpinner.text = `Generating TTS for ${chalk.cyan(file)} (${chalk.yellow(voiceName)})...`;
          const buffer = await fishClient.generateTTS(cleanText, voiceId);
          audioBuffers.set(voiceId, buffer);

          // Upload to S3
          fileSpinner.text = `Uploading ${chalk.yellow(voiceName)} to S3...`;
          const url = await s3Uploader.uploadAudio(buffer, file, voiceId);
          audioUrls.set(voiceId, url);
        }

        // Create voice array with URLs
        const voices: Array<{ id: string; name: string; url: string }> = config.voiceIds!.map((id, idx) => ({
          id,
          name: config.voiceNames![idx] || `Voice ${idx + 1}`,
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

        fileSpinner.succeed(
          chalk.green(`Generated TTS for ${chalk.cyan(file)}`)
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

    // Print summary
    console.log('\n' + chalk.bold('Summary:'));
    const successful = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(chalk.green(`  Successfully processed: ${successful}`));
    console.log(chalk.gray(`  Skipped: ${skipped}`));
    if (failed > 0) {
      console.log(chalk.red(`  Failed: ${failed}`));
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