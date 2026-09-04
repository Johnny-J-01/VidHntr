import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import store from "./store.js";
import ytdlp from "./ytdlp.js";
import ffmpegSvc from "./ffmpeg.js";
import transcription from "./transcription.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, "..", "storage");

const DIRS = {
    uploads: path.join(STORAGE, "uploads"),
    audio: path.join(STORAGE, "audio"),
    transcripts: path.join(STORAGE, "transcripts"),
    thumbnails: path.join(STORAGE, "thumbnails"),
    exports: path.join(STORAGE, "exports"),
};

Object.values(DIRS).forEach((directory) => {
    fs.mkdirSync(directory, { recursive: true });
});

function markError(videoId, message) {
    store.patchVideo(videoId, {
        status: "ERROR",
        progress: 0,
        error: message,
    });
}

async function runAudioTranscriptionPipeline(videoId, audioPath, duration, thumbnailPath = null) {
    const transcriptPath = path.join(DIRS.transcripts, `${videoId}.json`);
    let transcript = [];

    fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));

    store.patchVideo(videoId, {
        status: "TRANSCRIBING",
        progress: 20,
        duration,
        audioPath,
        thumbnailPath,
        transcriptPath,
        transcript: [],
        error: null,
    });

    await transcription.transcribeAudio(
        audioPath,
        duration,
        async (pct) => {
            store.patchVideo(videoId, {
                progress: 20 + Math.round(pct * 0.6),
            });
        },
        async (chunkSegments, info) => {
            transcript.push(...chunkSegments);
            transcript.sort((a, b) => a.start - b.start);

            fs.writeFileSync(
                transcriptPath,
                JSON.stringify(transcript, null, 2)
            );

            store.patchVideo(videoId, {
                transcript,
                transcriptPath,
                status: "TRANSCRIBING",
                progress: 20 + Math.round(info.progress * 0.6),
            });
        }
    );

    fs.writeFileSync(
        transcriptPath,
        JSON.stringify(transcript, null, 2)
    );

    store.patchVideo(videoId, {
        status: "ANALYZING",
        progress: 85,
        transcript,
        transcriptPath,
    });

    store.patchVideo(videoId, {
        status: "READY",
        progress: 100,
        transcript,
        transcriptPath,
    });

    if (fs.existsSync(audioPath)) {
        try {
            fs.unlinkSync(audioPath);
        } catch {}
    }
}

async function runProcessingPipeline(videoId) {
    try {
        const video = store.getVideo(videoId);

        if (!video) return;

        if (!video.filePath || !fs.existsSync(video.filePath)) {
            throw new Error("Source video file was not found.");
        }

        store.patchVideo(videoId, {
            status: "EXTRACTING_AUDIO",
            progress: 5,
            error: null,
        });

        const duration = await ffmpegSvc.probeDuration(video.filePath);

        const audioPath = path.join(
            DIRS.audio,
            `${videoId}.mp3`
        );

        await ffmpegSvc.extractAudio(
            video.filePath,
            audioPath
        );

        let thumbnailPath = null;

        try {
            thumbnailPath = await ffmpegSvc.generateThumbnail(
                video.filePath,
                DIRS.thumbnails,
                videoId,
                Math.min(3, duration / 2)
            );
        } catch {
            thumbnailPath = null;
        }

        await runAudioTranscriptionPipeline(
            videoId,
            audioPath,
            duration,
            thumbnailPath
        );
    } catch (error) {
        console.error(`Video ${videoId} processing failed:`, error);
        markError(
            videoId,
            error.message || "Processing failed."
        );
    }
}

async function runYouTubePipeline(videoId, url) {
    try {
        store.patchVideo(videoId, {
            status: "DOWNLOADING",
            progress: 2,
            sourceType: "youtube",
            sourceUrl: url,
            filePath: null,
            error: null,
        });

        let metadata = null;

        try {
            metadata = await ytdlp.fetchMetadata(url);
        } catch {}

        if (metadata?.title) {
            store.patchVideo(videoId, {
                title: metadata.title,
            });
        }

        if (
            metadata?.duration &&
            Number.isFinite(Number(metadata.duration))
        ) {
            store.patchVideo(videoId, {
                duration: Number(metadata.duration),
            });
        }

        const result = await ytdlp.downloadYouTubeAudio(
            url,
            DIRS.audio,
            videoId,
            (progress) => {
                store.patchVideo(videoId, {
                    progress: Math.min(
                        15,
                        2 + Math.round(progress * 0.13)
                    ),
                });
            }
        );

        const audioPath = result.filePath;

        if (!audioPath || !fs.existsSync(audioPath)) {
            throw new Error(
                "Audio download finished but the audio file was not found."
            );
        }

        const currentVideo = store.getVideo(videoId);

        const duration =
            Number(currentVideo?.duration) ||
            Number(metadata?.duration) ||
            0;

        if (!duration) {
            throw new Error(
                "Could not determine the YouTube video duration."
            );
        }

        store.patchVideo(videoId, {
            sourceType: "youtube",
            sourceUrl: url,
            filePath: null,
            audioPath,
            duration,
            title:
                currentVideo?.title ||
                metadata?.title ||
                "YouTube video",
            status: "TRANSCRIBING",
            progress: 20,
        });

        await runAudioTranscriptionPipeline(
            videoId,
            audioPath,
            duration,
            null
        );
    } catch (error) {
        console.error(`YouTube ${videoId} processing failed:`, error);
        markError(
            videoId,
            error.message || "We could not process this YouTube video."
        );
    }
}

export default {
    DIRS,
    runProcessingPipeline,
    runYouTubePipeline,
};