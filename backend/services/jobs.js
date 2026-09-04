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

function markExportError(exportId, message) {
    store.patchExport(exportId, {
        status: "ERROR",
        progress: 0,
        error: message,
    });
}

function sanitizeFilename(filename) {
    return String(filename || "clip")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\.+$/, "")
        .slice(0, 120) || "clip";
}

function buildExportFilename(filenameBase, width, height) {
    return `${sanitizeFilename(filenameBase)}_${width}x${height}.mp4`;
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

async function runExportJob(exportId) {
    let temporaryVideoPath = null;
    let captionsSrtPath = null;

    try {
        const exp = store.getExport(exportId);

        if (!exp) return;

        const video = store.getVideo(exp.videoId);

        if (!video) {
            throw new Error("Source video no longer exists.");
        }

        store.patchExport(exportId, {
            status: "PROCESSING",
            progress: 5,
            error: null,
        });

        if (
            exp.captions === "burn" &&
            video.transcriptPath &&
            fs.existsSync(video.transcriptPath)
        ) {
            const transcript = JSON.parse(
                fs.readFileSync(video.transcriptPath, "utf-8")
            );

            captionsSrtPath = path.join(
                DIRS.exports,
                `${exportId}.srt`
            );

            ffmpegSvc.buildSrtForRange(
                transcript,
                exp.start,
                exp.end,
                captionsSrtPath
            );
        }

        let sourcePath = video.filePath;

        const isYouTube =
            video.sourceType === "youtube" &&
            typeof video.sourceUrl === "string" &&
            video.sourceUrl.length > 0;

        if (sourcePath && fs.existsSync(sourcePath)) {
            store.patchExport(exportId, {
                progress: 10,
            });
        } else if (isYouTube) {
            const temporaryId = `${video.id}-export-${exportId}`;

            store.patchExport(exportId, {
                status: "PROCESSING",
                progress: 8,
            });

            const result =
                await ytdlp.downloadYouTubeVideoSection(
                    video.sourceUrl,
                    DIRS.uploads,
                    temporaryId,
                    exp.start,
                    exp.end,
                    (progress) => {
                        store.patchExport(exportId, {
                            status: "PROCESSING",
                            progress: Math.min(
                                40,
                                8 + Math.round(progress * 0.32)
                            ),
                        });
                    }
                );

            temporaryVideoPath = result.filePath;

            if (
                !temporaryVideoPath ||
                !fs.existsSync(temporaryVideoPath)
            ) {
                throw new Error(
                    "YouTube section download finished but the video file was not found."
                );
            }

            sourcePath = temporaryVideoPath;

            store.patchExport(exportId, {
                progress: 40,
            });
        } else {
            throw new Error(
                "Source video file is not available for export."
            );
        }

        const streams = await ffmpegSvc.probeStreams(sourcePath);

        if (!streams.hasVideo) {
            throw new Error(
                "The source file does not contain a video stream."
            );
        }

        const filename = buildExportFilename(
            exp.filenameBase,
            exp.width,
            exp.height
        );

        const outputPath = path.join(
            DIRS.exports,
            `${exportId}_${filename}`
        );

        await ffmpegSvc.exportClip({
            sourcePath,
            outputPath,
            start: isYouTube ? 0 : exp.start,
            end: isYouTube
                ? exp.end - exp.start
                : exp.end,
            width: exp.width,
            height: exp.height,
            quality: exp.quality,
            cropMode: exp.cropMode || "fill",
            captionsSrtPath,
            onProgress: (progress) => {
                const mappedProgress = isYouTube
                    ? 40 + Math.round(progress * 0.6)
                    : 10 + Math.round(progress * 0.9);

                store.patchExport(exportId, {
                    status: "PROCESSING",
                    progress: Math.min(99, mappedProgress),
                });
            },
        });

        if (!fs.existsSync(outputPath)) {
            throw new Error(
                "FFmpeg finished but the exported video file was not created."
            );
        }

        const outputStats = fs.statSync(outputPath);

        if (outputStats.size <= 0) {
            throw new Error(
                "The exported video file is empty."
            );
        }

        if (
            captionsSrtPath &&
            fs.existsSync(captionsSrtPath)
        ) {
            try {
                fs.unlinkSync(captionsSrtPath);
            } catch {}
        }

        if (
            temporaryVideoPath &&
            fs.existsSync(temporaryVideoPath)
        ) {
            try {
                fs.unlinkSync(temporaryVideoPath);
            } catch {}
        }

        store.patchExport(exportId, {
            status: "READY",
            progress: 100,
            outputPath,
            filename,
            error: null,
        });
    } catch (error) {
        console.error(`Export ${exportId} failed:`, error);

        if (
            captionsSrtPath &&
            fs.existsSync(captionsSrtPath)
        ) {
            try {
                fs.unlinkSync(captionsSrtPath);
            } catch {}
        }

        if (
            temporaryVideoPath &&
            fs.existsSync(temporaryVideoPath)
        ) {
            try {
                fs.unlinkSync(temporaryVideoPath);
            } catch {}
        }

        markExportError(
            exportId,
            error.message || "Export failed."
        );
    }
}

export default {
    DIRS,
    runProcessingPipeline,
    runYouTubePipeline,
    runExportJob,
};