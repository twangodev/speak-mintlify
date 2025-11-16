# speak-mintlify

[![Fish Audio](https://img.shields.io/badge/Fish_Audio-Badge?logo=fishaudio&logoColor=fff&logoSize=auto&label=Powered%20By&color=21176d)](https://fish.audio)
[![npm version](https://img.shields.io/npm/v/speak-mintlify)](https://www.npmjs.com/package/speak-mintlify)
[![npm downloads](https://img.shields.io/npm/dm/speak-mintlify)](https://www.npmjs.com/package/speak-mintlify)
[![License](https://img.shields.io/github/license/twangodev/speak-mintlify)](LICENSE)

**_Add voice narration to your documentation to drive developer engagement and accessibility._**

`speak-mintlify` intelligently generates text-to-speech audio for your Mintlify documentation. 

## Features

- Generate TTS audio directly from your MDX file, only regenerating when content changes
- Supports multiple voices with easy configuration
- Upload your audio files to S3 (compatible with Cloudflare R2, MinIO, etc.)
- Inject audio player components into your documentation
- Ready to integrate with CI/CD pipelines

## Setup

### 1. Initialize `speaker-config.yaml`

`speaker-config.yaml` holds your voice configuration and optional component settings. 

```yaml
# speaker-config.yaml
# S3 credentials and API keys should go in .env or environment variables

# Voice Configuration (map of voice ID -> display name)
voices:
  8ef4a238714b45718ce04243307c57a7: E-girl
  bf322df2096a46f18c579d0baa36f41d: Adrian
  # Add more voices as needed

# Component Configuration (optional)
component:
  import: /snippets/audio-transcript.jsx
  name: AudioTranscript
```

You can reference our example [speaker-config.yaml](speaker-config.yaml) for more details.

### 2. Configure Environment Variables

You can set environment variables in a `.env` file at your repository root or directly in your CI/CD environment.

```env
# Secrets (required)
FISH_API_KEY=your_api_key
S3_ACCESS_KEY_ID=your_access_key_id
S3_SECRET_ACCESS_KEY=your_secret_key

# S3 Config (required)
S3_BUCKET=your-bucket
S3_PUBLIC_URL=https://cdn.example.com
S3_REGION=us-east-1
S3_ENDPOINT=https://account-id.r2.cloudflarestorage.com
```

Check out the [.env.example](.env.example) for reference.

### 3. Create Audio Component

In your MDX files, import the audio component specified in your `speaker-config.yaml`:

Your audio component will need to accept the following props:

```typescript
{
  voices: Array<{
    name: string;    // Display name for the voice
    url: string;     // Audio file URL (S3 or any accessible URL)
  }>
}
```

**Example:**
```jsx
<AudioTranscript
  voices={[
    { name: "Natural Voice", url: "https://s3.../audio1.mp3" },
    { name: "Professional Voice", url: "https://s3.../audio2.mp3" }
  ]}
/>
```

Feel free to get started with our [audio-transcript.jsx](audio-transcript.jsx) file and customize it to fit your design.

### 4. Run the Generator

Once you have configured everything, run the generator on your documentation directory:

```bash
# From your docs repository root
npx speak-mintlify generate .
```

If your documentation is within a subdirectory, specify the path accordingly (e.g., `npx speak-mintlify generate ./docs`).

You may want to preview changes first using the `--dry-run` flag.

### 5. Integrate with CI/CD

Once you are satisfied with the setup, integrate `speak-mintlify` into your CI/CD pipeline to automate audio generation on content updates.

Check out how [Fish Audio](https://docs.fish.audio) integrates with GitHub Actions over at their [repository](https://github.com/fishaudio/docs/blob/main/.github/workflows/tts.yaml).

## Commands

### `generate` - Generate TTS audio

```bash
npx speak-mintlify generate [directory]

# Useful flags:
#   --dry-run       Preview changes without generating
#   --verbose       Show extracted text and details
#   --pattern       File pattern (default: **/*.mdx)

# Run with --help to see all options
npx speak-mintlify generate --help
```

### `cleanup` - Remove orphaned audio files

Removes audio files from S3 that are no longer referenced in your MDX files.

```bash
npx speak-mintlify cleanup [directory]

# Preview before deleting
npx speak-mintlify cleanup . --dry-run
```

### `.speakignore`

Exclude files from processing by creating `.speakignore` in your repository root:

```text
snippets/**
api-reference/**
temp/**
drafts/**
```

## About Fish Audio

`speak-mintlify` is built with [Fish Audio](https://fish.audio) for its affordable, high-quality, natural-sounding
voices. Other providers can be expensive and difficult to use at scale. Fish Audio makes it easy to add voice narration
to your documentation without breaking the bank.
