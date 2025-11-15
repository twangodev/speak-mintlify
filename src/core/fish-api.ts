/**
 * Fish Audio API Client
 * Simple wrapper around the official Fish Audio SDK
 */

import { FishAudioClient as FishAudioSDK } from 'fish-audio';
import pRetry from 'p-retry';

/**
 * Fish Audio Client
 */
export class FishAudioClient {
  private sdk: FishAudioSDK;

  constructor(apiKey: string) {
    this.sdk = new FishAudioSDK({ apiKey });
  }

  /**
   * Generate TTS audio as MP3
   * @param text - Text to convert to speech
   * @param voiceId - Fish Audio voice reference ID
   * @returns Audio buffer (MP3)
   */
  async generateTTS(text: string, voiceId: string): Promise<Buffer> {
    return pRetry(
      async () => {
        const audio = await this.sdk.textToSpeech.convert({
          text,
          reference_id: voiceId,
        });

        // Convert Response to Buffer
        const buffer = Buffer.from(await new Response(audio).arrayBuffer());
        return buffer;
      },
      {
        retries: 3,
        onFailedAttempt: (error) => {
          console.warn(
            `TTS attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
          );
        },
      }
    );
  }

  /**
   * Generate TTS for multiple voices in parallel
   * @param text - Text to convert to speech
   * @param voiceIds - Array of voice IDs
   * @returns Map of voice ID to audio buffer
   */
  async generateMultipleVoices(
    text: string,
    voiceIds: string[]
  ): Promise<Map<string, Buffer>> {
    const results = await Promise.all(
      voiceIds.map(async (voiceId) => {
        const buffer = await this.generateTTS(text, voiceId);
        return { voiceId, buffer };
      })
    );

    return new Map(results.map((r) => [r.voiceId, r.buffer]));
  }
}

/**
 * Create a Fish Audio client instance
 */
export function createFishAudioClient(apiKey: string): FishAudioClient {
  return new FishAudioClient(apiKey);
}