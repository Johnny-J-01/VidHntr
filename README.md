# VidHntr

AI-powered video repurposing platform that helps creators find the best moments in long-form videos, turn them into clips, add subtitles, resize them for different platforms, and export them — all from one place.

---

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Clone the Repository](#1-clone-the-repository)
  - [Configure the Backend](#2-configure-the-backend)
  - [Install Dependencies](#3-install-dependencies)
  - [Start the Backend](#4-start-the-backend)
  - [Start the Frontend](#5-start-the-frontend)
- [Key Features](#key-features)
  - [AI Clip Discovery](#ai-clip-discovery)
  - [Natural-Language Semantic Search](#natural-language-semantic-search)
  - [Mood & Category Discovery](#mood--category-discovery)
  - [Automatic Highlight Suggestions](#automatic-highlight-suggestions)
  - [Creator-Controlled Clipping](#creator-controlled-clipping)
  - [Video Player](#video-player)
  - [Interactive Timeline Editor](#interactive-timeline-editor)
  - [Multilingual Transcription & Subtitles](#multilingual-transcription--subtitles)
  - [Resizing & Export](#resizing--export)
  - [Video Ingestion](#video-ingestion)
  - [Background Processing](#background-processing)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [API Reference](#api-reference)

---

## Overview

Creating short-form content from long-form video usually requires several different tools.

A creator might need one tool to download or upload a video, another to find interesting moments, another to trim the footage, another to generate captions, another to resize the video, and finally another tool to export the finished clip.

VidHntr brings this workflow together into a single application.

The platform combines AI-powered transcript analysis with a video editing pipeline so creators can search through their videos using natural language, discover potential highlights, manually control the exact clip, generate subtitles, change the output format, and export the finished video.

### Core Workflow

```text
Upload / Import Video
        ↓
   Video Processing
        ↓
    Transcription
        ↓
 AI Transcript Analysis
        ↓
 Search / Discover Moments
        ↓
    Select Clip
        ↓
 Edit Timeline
        ↓
 Generate Subtitles
        ↓
 Select Output Format
        ↓
    Render Video
        ↓
      Export
```

VidHntr is designed around a simple workflow:

**Find the moment. Clip it. Caption it. Export it.**

---

## Getting Started

### Prerequisites

Before running VidHntr locally, make sure the following are installed.

- Node.js v18.x or higher
- npm v9.x or higher
- FFmpeg, installed and available on your system `PATH`
- yt-dlp (optional, required only for YouTube URL ingestion)

Check your installations with:

```bash
node --version
npm --version
ffmpeg -version
```

If Node.js is not installed, download it from the [official Node.js website](https://nodejs.org/).

VidHntr requires API credentials for the AI and transcription services used by the application. You will need:

- Gemini API key
- Deepgram API key (or an alternative speech-to-text provider key, if configured)

### 1. Clone the Repository

Clone the VidHntr repository:

```bash
git clone <your-repository-url>
cd VidHntr
```

The project contains the `backend` and `frontend` directories required to run VidHntr locally.

### 2. Configure the Backend

Navigate to the backend directory:

```bash
cd backend
```

Create a `.env` file inside the `backend` directory.

Example:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

# AI & Transcription Keys
GEMINI_API_KEY=your_gemini_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key

# Path to yt-dlp binary (only needed for YouTube ingestion, if not already on PATH)
YTDLP_PATH=yt-dlp
```

Replace the placeholder values with your actual API keys.

#### Environment Variables

| Variable            | Description                                                    |
|---------------------|------------------------------------------------------------------|
| `PORT`              | Port used by the backend server                                 |
| `CLIENT_ORIGIN`     | Origin the backend allows for CORS (the frontend dev server URL) |
| `GEMINI_API_KEY`    | API key used for AI-powered transcript analysis and search       |
| `DEEPGRAM_API_KEY`  | API key used for speech-to-text transcription                    |
| `YTDLP_PATH`        | Path to the `yt-dlp` binary, if it isn't already on your `PATH`  |

> Never expose API keys in frontend code.

The `.env` file should also be excluded from Git.

Add the following to `.gitignore` if it is not already present:

```gitignore
.env
node_modules/
```

### 3. Install Dependencies

Install the backend dependencies:

```bash
cd backend
npm install
```

Then install the frontend dependencies:

```bash
cd ../frontend
npm install
```

### 4. Start the Backend

Navigate to the backend directory:

```bash
cd backend
```

Start the server:

```bash
npm start
```

The backend should start on:

```text
http://localhost:4000
```

The backend is responsible for:

- Video processing
- Video ingestion
- Transcription
- AI requests
- Semantic search
- Clip discovery
- Caption generation
- FFmpeg processing
- Video export
- Background processing

Keep the backend terminal running while using the application.

### 5. Start the Frontend

Open a new terminal window.

Navigate to the frontend directory:

```bash
cd frontend
```

Start the frontend development server:

```bash
npm run dev
```

The frontend will be available at:

```text
http://localhost:5173
```

Open the URL in your browser to launch VidHntr.

---

## Key Features

### AI Clip Discovery

VidHntr uses AI to analyze the transcript of a video and identify sections that may work well as short-form clips.

Instead of manually watching an entire video and searching through the timeline, creators can use the transcript as a searchable representation of the video.

The AI can identify moments based on:

- Topic
- Context
- Meaning
- Relevance
- Interesting statements
- Educational value
- Entertainment value
- Potential short-form appeal

For example, a creator can ask:

> Find the part where the speaker talks about artificial intelligence.

VidHntr can analyze the transcript and return relevant portions of the video along with their timestamps.

This allows the creator to jump directly to the relevant moment.

### Natural-Language Semantic Search

VidHntr supports natural-language search over a video's transcript.

Traditional video search often depends on exact keyword matches.

For example, if the transcript contains:

> One of the biggest challenges for modern developers is understanding how artificial intelligence is changing the way software is built.

A user could search:

> How is AI changing software development?

even if the exact sentence does not appear in the transcript.

The search is based on the meaning and context of the transcript rather than simply matching individual words.

#### Example Queries

- Find where they discuss AI.
- Find the section about starting a company.
- Where does the speaker explain the biggest mistake beginners make?
- Find an emotional moment.
- Find a section that would make a good short.

The resulting timestamp can then be opened directly in the video editor.

### Mood & Category Discovery

VidHntr can analyze transcript content to help identify moments based on mood, tone, or content category.

This provides another way to discover clips without knowing the exact words used in the video.

Examples of discovery categories include:

- Funny
- Emotional
- Inspirational
- Educational
- Controversial
- Interesting
- Motivational
- Storytelling
- Technical
- Informative

A creator can use these categories to quickly explore different types of moments within the same video.

For example:

> Show me funny moments.

or:

> Find inspirational sections.

The AI analyzes the transcript and returns relevant moments with their associated timestamps.

### Automatic Highlight Suggestions

VidHntr can automatically suggest potential highlights from a long-form video.

The goal is to reduce the amount of manual searching required from the creator.

The system analyzes the available transcript and looks for sections that may have strong short-form potential.

Potential highlights can include:

- Strong statements
- Interesting explanations
- Memorable quotes
- Stories
- Important conclusions
- Surprising information
- Educational sections
- Entertaining moments

Each suggestion can include:

- Title
- Description
- Start Timestamp
- End Timestamp

The creator can then preview the suggested section before deciding whether to use it.

#### Timestamp Validation

AI-generated timestamps are validated against the actual duration of the video.

For example, if the video is:

```text
10:18
```

the AI must not produce a clip ending at:

```text
11:30
```

Invalid timestamps are normalized or rejected before being passed to the video-processing pipeline.

This helps prevent invalid clip ranges and failed exports.

### Creator-Controlled Clipping

AI suggestions are designed to assist the creator, not replace the creator's control over the final video.

Creators can manually select the exact portion of the video they want to use.

A clip is defined by:

```text
Start Time
    ↓
Selected Video Segment
    ↓
End Time
```

For example:

```text
Start: 04:20
End:   05:45
```

The creator can adjust the start and end points until the desired section is selected.

This allows AI-assisted discovery while keeping the final editing decision in the creator's hands.

### Video Player

VidHntr includes an integrated video player for previewing the source video and selected clips.

The player allows creators to:

- Play and pause the video
- Seek through the timeline
- Preview selected sections
- Jump to AI-discovered timestamps
- Review clips before exporting

AI search results and suggested clips can be connected directly to the video timeline so that creators can quickly preview the corresponding section.

The video player is an important part of the discovery workflow because creators can verify the actual footage before committing to an export.

### Interactive Timeline Editor

VidHntr provides an interactive timeline for selecting and editing video ranges.

The timeline represents the relationship between:

```text
Video Position
      +
Transcript
      +
Selected Clip
```

Creators can control:

- Clip start
- Clip end
- Selected duration
- Playback position

For example:

```text
00:00 ───────────────────────────────── 10:18
              │──────────────│
             Start           End
             04:20          05:45
```

The selected range is used by the export pipeline to determine which portion of the original video should be rendered.

The timeline also helps creators visually understand where their selected clip exists within the full video.

### Multilingual Transcription & Subtitles

VidHntr uses speech-to-text transcription to convert spoken content into timestamped text.

The transcription pipeline produces data that can be used for both:

- Semantic search
- Subtitle generation

The system supports multilingual transcription through the underlying transcription service.

The general pipeline is:

```text
Video
  ↓
Extract Audio
  ↓
Speech-to-Text
  ↓
Timestamped Transcript
  ↓
Subtitle Data
  ↓
SRT Generation
  ↓
Subtitle Rendering
```

#### Timestamped Transcript

A transcript contains text associated with specific points in the original video.

For example:

```text
00:01.000 → Welcome to the video.
00:04.200 → Today we're going to talk about AI.
00:08.700 → Let's start with the basics.
```

This timestamp information allows VidHntr to connect transcript content with the actual video.

#### Subtitle Timing

When a clip is created from the middle of a video, subtitle timestamps need to be converted from original-video time to clip-relative time.

For example:

```text
Original Video

05:00 ─────────────── 06:00
       Selected Clip
```

A subtitle occurring at:

```text
05:15
```

in the original video should appear at:

```text
00:15
```

in the exported clip.

This keeps subtitles synchronized after trimming.

### Resizing & Export

VidHntr allows creators to convert their clips into different aspect ratios and output formats.

Common formats include:

**Landscape**
- 16:9
- 1920 × 1080

Useful for:
- YouTube
- Standard video
- Desktop viewing

**Vertical**
- 9:16
- 1080 × 1920

Useful for:
- YouTube Shorts
- TikTok
- Instagram Reels

**Square**
- 1:1
- 1080 × 1080

Useful for:
- Social media posts
- Square video feeds

#### Content Preservation

Changing the output dimensions should not simply crop away important parts of the original video.

For example:

```text
16:9 Source

┌──────────────────────────────┐
│                              │
│         FULL VIDEO           │
│                              │
└──────────────────────────────┘
```

When converting to:

```text
9:16 Output

┌──────────────┐
│              │
│   CONTENT    │
│              │
│              │
└──────────────┘
```

the video-processing pipeline should intelligently scale and position the source content rather than blindly removing large portions of the original frame.

#### Export Pipeline

The final export can combine:

```text
Source Video
     +
Selected Clip Range
     +
Output Dimensions
     +
Subtitles
     ↓
FFmpeg
     ↓
Final Video
```

Audio is preserved during the export unless explicitly changed by the application.

### Video Ingestion

VidHntr supports importing video content into the application.

Video sources can include:

- Local video uploads
- YouTube videos
- Previously processed videos

Once a video is ingested, it can be processed by the backend.

The ingestion pipeline prepares the video for the rest of the VidHntr workflow.

```text
Video Source
     ↓
Ingestion
     ↓
Video Storage
     ↓
Processing
     ↓
Transcription
     ↓
AI Discovery
     ↓
Editing
     ↓
Export
```

#### YouTube Ingestion

For supported YouTube URLs, VidHntr can retrieve the video and prepare it for processing.

The downloaded media is then passed into the same processing pipeline used for uploaded videos.

This allows both uploaded and externally sourced videos to follow the same workflow after ingestion.

### Background Processing

Video processing and transcription can be computationally expensive and may take time depending on the size and length of the source video.

VidHntr therefore separates long-running processing tasks from the immediate user interface.

Background processing can handle tasks such as:

- Video ingestion
- Audio extraction
- Transcription
- AI analysis
- Video rendering
- Subtitle generation
- Final export

A simplified processing lifecycle is:

```text
User Starts Processing
        ↓
Create Processing Job
        ↓
Background Processing
        ↓
Update Progress
        ↓
Processing Complete
        ↓
Make Result Available
```

Progress information can be communicated back to the frontend so users can see that their video is still being processed.

This prevents long-running FFmpeg or transcription operations from blocking the application's main request flow.

---

## Architecture

VidHntr follows a client-server architecture.

```text
┌─────────────────────────────┐
│          Frontend           │
│                             │
│  React                      │
│  Video Player               │
│  Timeline Editor            │
│  Search                     │
│  Clip Controls              │
│  Export Controls            │
└──────────────┬──────────────┘
               │
               │ HTTP / API
               ↓
┌─────────────────────────────┐
│           Backend           │
│                             │
│  Node.js                    │
│  Express                    │
│  API Routes                 │
│  Video Processing           │
│  AI Integration             │
│  Transcription              │
│  File Management            │
└───────┬──────────┬──────────┘
        │          │
        │          │
        ↓          ↓
┌────────────┐  ┌────────────┐
│  Gemini    │  │  Deepgram  │
│            │  │            │
│ AI Search  │  │ Transcribe │
│ AI Clips   │  │  Captions  │
└────────────┘  └────────────┘

        Backend
           │
           ↓
      ┌─────────┐
      │ FFmpeg  │
      │         │
      │ Trim    │
      │ Scale   │
      │ Encode  │
      │ Captions│
      └─────────┘
```

### Frontend

The frontend is responsible for the user-facing experience.

It handles:

- Video selection
- Video playback
- Timeline interaction
- Search
- AI suggestions
- Clip selection
- Export settings
- Processing status
- Results

### Backend

The backend acts as the central processing layer.

It handles:

- API requests
- Video ingestion
- File processing
- Audio extraction
- Transcription requests
- AI requests
- Timestamp validation
- Subtitle generation
- FFmpeg processing
- Export management

### AI Layer

The AI layer analyzes transcript information and provides:

- Semantic search
- Clip discovery
- Mood discovery
- Category discovery
- Highlight suggestions

### Transcription Layer

The transcription service converts spoken audio into timestamped text.

This data is used by both the AI discovery system and subtitle pipeline.

### Media Processing Layer

FFmpeg performs the actual media transformations required to produce the final video.

---

## Tech Stack

### Frontend

- React
- JavaScript
- CSS
- Vite

### Backend

- Node.js
- Express

### Artificial Intelligence

**Gemini**

Gemini is used for transcript understanding, semantic search, clip discovery, mood/category analysis, and highlight suggestions.

### Speech-to-Text

**Deepgram**

Deepgram is used to generate timestamped transcriptions that power search and subtitle generation.

### Media Processing

- FFmpeg
- FFprobe

FFmpeg handles video and audio processing, while FFprobe can be used to inspect media metadata such as video duration.

### Development

- npm
- Git
- GitHub

---

## API Reference

### Video Ingestion

```http
POST /api/videos
```

### Video Processing

```http
POST /api/videos/:videoId/process
```

### Transcription

```http
POST /api/transcribe
```

### AI Search

```http
POST /api/search
```

### AI Clip Suggestions

```http
POST /api/suggestions
```

### Mood & Category Discovery

```http
POST /api/discover
```

### Video Export

```http
POST /api/export
```

### Export Status

```http
GET /api/export/:exportId/status
```
