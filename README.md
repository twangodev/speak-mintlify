# speak-mintlify

[![Fish Audio](https://img.shields.io/badge/Fish_Audio-Badge?logo=fishaudio&logoColor=fff&logoSize=auto&label=Powered%20By&color=21176d)](https://fish.audio)
[![npm version](https://img.shields.io/npm/v/speak-mintlify)](https://www.npmjs.com/package/speak-mintlify)
[![npm downloads](https://img.shields.io/npm/dm/speak-mintlify)](https://www.npmjs.com/package/speak-mintlify)
[![License](https://img.shields.io/github/license/twangodev/speak-mintlify)](LICENSE)

Generate high-quality text-to-speech audio for Mintlify documentation using Fish Audio.

## Features

- Automatic TTS generation for MDX documentation
- Smart caching (hash-based, skips unchanged content)
- Multiple voices per page
- S3-compatible storage (AWS S3, Cloudflare R2, MinIO)
- Simple configuration with `speaker-config.yaml`

## Quick Start

```bash
# Run from your docs repository root
npx speak-mintlify generate .
```

## Setup

### 1. Create `speaker-config.yaml` in your repository root

```yaml
# speaker-config.yaml
# S3 credentials and API keys should go in .env or environment variables

# Voice Configuration (map of voice ID -> display name)
voices:
  8ef4a238714b45718ce04243307c57a7: E-girl
  802e3bc2b27e49c2995d23ef70e6ac89: Energetic Male
  933563129e564b19a115bedd57b7406a: Sarah
  bf322df2096a46f18c579d0baa36f41d: Adrian
  b347db033a6549378b48d00acb0d06cd: Selene
  536d3a5e000945adb7038665781a4aca: Ethan
  # Add more voices as needed

# Component Configuration (optional)
component:
  import: /snippets/audio-transcript.jsx
  name: AudioTranscript
```

### 2. Create `.env` for secrets (never commit)

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

# Configure voices in speaker-config.yaml
```

### 3. Run the CLI

```bash
# From your docs repository root
npx speak-mintlify generate .
```

## How It Works

1. Finds all `.mdx` files (respects `.speakignore`)
2. Extracts clean text (removes code, tables, components, URLs)
3. Generates SHA-256 hash and checks if content changed
4. Calls Fish Audio API for each voice
5. Uploads MP3s to S3
6. Injects `<AudioTranscript>` component with hash comment

**Example output:**

```mdx
---
title: Getting Started
---
import { AudioTranscript } from '/snippets/audio-transcript.jsx';

{/* speak-mintlify-hash: abc123def456... */}
<AudioTranscript voices={[
  {
    "id": "8ef4a238714b45718ce04243307c57a7",
    "name": "E-girl",
    "url": "https://cdn.example.com/audio/getting-started-intro/model_id.mp3"
  }
]} />

## Quick Start
...
```

## Configuration

### Priority Order

1. CLI flags (highest)
2. Environment variables (`.env`)
3. `speaker-config.yaml`
4. Defaults (lowest)

### CLI Options

```bash
npx speak-mintlify generate [directory] [options]

Options:
  --voices <ids>              Voice IDs (or use speaker-config.yaml)
  --voice-names <names>       Voice names
  --api-key <key>             Fish API key (or use FISH_API_KEY)
  --s3-bucket <bucket>        S3 bucket (or use S3_BUCKET)
  --s3-public-url <url>       CDN URL (or use S3_PUBLIC_URL)
  --s3-region <region>        S3 region (default: us-east-1)
  --s3-endpoint <url>         S3 endpoint for R2/MinIO
  --s3-access-key-id <key>    S3 access key
  --s3-secret-access-key <k>  S3 secret key
  --pattern <glob>            File pattern (default: **/*.mdx)
  --dry-run                   Preview changes without generating
  --verbose                   Show extracted text and details
```

### `.speakignore` (optional)

Create `.speakignore` in your repository root to exclude files:

```
snippets/**
api-reference/**
temp/**
drafts/**
```

## Examples

### Dry Run (Preview)

```bash
# Preview what would be generated
npx speak-mintlify generate . --dry-run --verbose
```

### Specific Files

```bash
# Only process files in a subdirectory
npx speak-mintlify generate . --pattern "guides/**/*.mdx"
```

### Override Voices

```bash
# Override voices from speaker-config.yaml
npx speak-mintlify generate . \
  --voices "voice-id-1,voice-id-2" \
  --voice-names "Male,Female"
```