import express from "express";
import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";
import fs from "fs";

import store from "../services/store.js";
import jobs from "../services/jobs.js";
import ytdlp from "../services/ytdlp.js";
import ai from "../services/ai.js";

const router = express.Router();

const ALLOWED_MIME = new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
]);

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

const upload = multer({
    storage: multer.diskStorage({
        destination: (request, file, callback) => callback(null, jobs.DIRS.uploads),
        filename: (request, file, callback) => {
            const id = request.videoId || (request.videoId = uuid());
            const ext = path.extname(file.originalname) || ".mp4";
            callback(null, `${id}${ext}`);
        },
    }),
    limits: { fileSize: MAX_SIZE_BYTES },
    fileFilter: (request, file, callback) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
            callback(new Error("Unsupported file type. Upload MP4, MOV, or WebM."));
            return;
        }

        callback(null, true);
    },
});

function publicVideo(video) {
    if (!video) return null;

    return {
        id: video.id,
        title: video.title,
        sourceType: video.sourceType,
        sourceUrl: video.sourceUrl || null,
        duration: video.duration || null,
        status: video.status,
        progress: video.progress ?? 0,
        error: video.error || null,
        createdAt: video.createdAt,
    };
}

function getYouTubeVideoId(url) {
    if (!url || typeof url !== "string") return null;

    try {
        const parsed = new URL(url);

        if (["www.youtube.com", "youtube.com", "m.youtube.com"].includes(parsed.hostname)) {
            const pathname = parsed.pathname;

            if (pathname === "/watch") return parsed.searchParams.get("v");
            if (pathname.startsWith("/embed/")) return pathname.split("/")[2] || null;
            if (pathname.startsWith("/shorts/")) return pathname.split("/")[2] || null;
            if (pathname.startsWith("/live/")) return pathname.split("/")[2] || null;
        }

        if (parsed.hostname === "youtu.be") {
            return parsed.pathname.split("/")[1] || null;
        }

        return null;
    } catch {
        return null;
    }
}

router.post("/upload", (request, response) => {
    upload.single("video")(request, response, (error) => {
        if (error) {
            return response.status(400).json({
                error: error.message || "Upload failed.",
            });
        }

        if (!request.file) {
            return response.status(400).json({
                error: "No video file was provided.",
            });
        }

        const id = request.videoId;

        const title = (
            request.body.title ||
            request.file.originalname ||
            "Untitled video"
        ).replace(/\.[^/.]+$/, "");

        const video = {
            id,
            title,
            sourceType: "upload",
            sourceUrl: null,
            filePath: request.file.path,
            thumbnailPath: null,
            duration: null,
            status: "QUEUED",
            progress: 0,
            transcript: null,
            transcriptPath: null,
            createdAt: Date.now(),
        };

        store.upsertVideo(video);
        jobs.runProcessingPipeline(id);

        response.status(202).json({
            videoId: id,
            status: "queued",
        });
    });
});

router.get("/", (request, response) => {
    response.json(store.listVideos().map(publicVideo));
});

router.post("/youtube", (request, response) => {
    const { url } = request.body || {};

    if (!ytdlp.isValidYouTubeUrl(url)) {
        return response.status(400).json({
            error: "That doesn't look like a valid YouTube URL.",
        });
    }

    const id = uuid();
    const youtubeId = getYouTubeVideoId(url);

    const video = {
        id,
        title: "YouTube video",
        sourceType: "youtube",
        sourceUrl: url,
        youtubeId,
        filePath: null,
        thumbnailPath: null,
        duration: null,
        status: "QUEUED",
        progress: 0,
        transcript: null,
        transcriptPath: null,
        createdAt: Date.now(),
    };

    store.upsertVideo(video);
    jobs.runYouTubePipeline(id, url);

    response.status(202).json({
        videoId: id,
        status: "queued",
    });
});

router.get("/:id/youtube", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video) {
        return response.status(404).json({
            error: "Video not found.",
        });
    }

    if (video.sourceType !== "youtube") {
        return response.status(400).json({
            error: "This video is not a YouTube video.",
        });
    }

    const youtubeId = video.youtubeId || getYouTubeVideoId(video.sourceUrl);

    if (!youtubeId) {
        return response.status(400).json({
            error: "Could not determine the YouTube video ID.",
        });
    }

    response.json({
        videoId: video.id,
        youtubeId,
        sourceUrl: video.sourceUrl,
        embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
    });
});

router.get("/:id/status", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video) {
        return response.status(404).json({
            error: "Video not found.",
        });
    }

    response.json({
        status: video.status,
        progress: video.progress ?? 0,
        error: video.error || null,
    });
});

router.get("/:id/transcript", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video) {
        return response.status(404).json({
            error: "Video not found.",
        });
    }

    if (!video.transcriptPath || !fs.existsSync(video.transcriptPath)) {
        return response.status(409).json({
            error: "Transcript is not ready yet.",
        });
    }

    const transcript = JSON.parse(
        fs.readFileSync(video.transcriptPath, "utf-8")
    );

    response.json({
        videoId: video.id,
        transcript,
    });
});

router.get("/:id/file", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video || !video.filePath || !fs.existsSync(video.filePath)) {
        return response.status(404).json({
            error: "Video file not found.",
        });
    }

    response.sendFile(path.resolve(video.filePath));
});

router.get("/:id/thumbnail", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video || !video.thumbnailPath || !fs.existsSync(video.thumbnailPath)) {
        return response.status(404).end();
    }

    response.sendFile(path.resolve(video.thumbnailPath));
});

function loadTranscriptOrThrow(video) {
    if (!video.transcriptPath || !fs.existsSync(video.transcriptPath)) {
        const error = new Error(
            "This video is still processing. Try again once it is ready."
        );

        error.status = 409;
        throw error;
    }

    return JSON.parse(
        fs.readFileSync(video.transcriptPath, "utf-8")
    );
}

router.post("/:id/search", async (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video) {
        return response.status(404).json({
            error: "Video not found.",
        });
    }

    try {
        const transcript = loadTranscriptOrThrow(video);
        const { query, mood } = request.body || {};

        let results;

        if (mood) {
            results = await ai.searchByMood(
                transcript,
                mood,
                video.duration || 0
            );
        } else {
            if (!query || !query.trim()) {
                return response.status(400).json({
                    error: "Enter something to search for.",
                });
            }

            results = await ai.semanticSearch(
                transcript,
                query.trim(),
                video.duration || 0
            );
        }

        response.json({
            videoId: video.id,
            query: query || mood,
            results,
        });
    } catch (error) {
        response.status(error.status || 500).json({
            error:
                error.message ||
                "Something went wrong while searching this video.",
        });
    }
});

router.post("/:id/suggestions", async (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video) {
        return response.status(404).json({
            error: "Video not found.",
        });
    }

    try {
        const transcript = loadTranscriptOrThrow(video);

        const suggestions = await ai.suggestClips(
            transcript,
            video.duration || 0
        );

        response.json({
            videoId: video.id,
            suggestions,
        });
    } catch (error) {
        response.status(error.status || 500).json({
            error:
                error.message ||
                "Something went wrong while analyzing this video.",
        });
    }
});

router.get("/:id", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video) {
        return response.status(404).json({
            error: "Video not found.",
        });
    }

    response.json(publicVideo(video));
});

export default router;