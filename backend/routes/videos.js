import express from "express";
import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";
import fs from "fs";

import store from "../services/store.js";
import jobs from "../services/jobs.js";
import ytdlp from "../services/ytdlp.js";

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

        if (parsed.hostname === "youtu.be") return parsed.pathname.split("/")[1] || null;

        return null;
    } catch {
        return null;
    }
}

router.post("/upload", (request, response) => {
    upload.single("video")(request, response, (error) => {
        if (error) {
            return response.status(400).json({ error: error.message || "Upload failed." });
        }

        if (!request.file) {
            return response.status(400).json({ error: "No video file was provided." });
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

router.post("/youtube", async (request, response) => {
    const { url } = request.body;

    if (!ytdlp.isValidYouTubeUrl(url)) {
        return response.status(400).json({ error: "Invalid YouTube URL." });
    }

    const id = uuid();

    try {
        const metadata = await ytdlp.fetchMetadata(url);
        const title = metadata.title || "YouTube video";

        const video = {
            id,
            title,
            sourceType: "youtube",
            sourceUrl: url,
            filePath: null,
            thumbnailPath: null,
            duration: metadata.duration || null,
            status: "DOWNLOADING",
            progress: 0,
            transcript: null,
            transcriptPath: null,
            createdAt: Date.now(),
        };

        store.upsertVideo(video);

        response.status(202).json({
            videoId: id,
            status: "downloading",
        });

        try {
            const result = await ytdlp.downloadYouTubeVideo(
                url,
                jobs.DIRS.uploads,
                id,
                (progress) => {
                    const current = store.getVideo(id);
                    if (!current) return;

                    store.upsertVideo({
                        ...current,
                        progress,
                    });
                }
            );

            const current = store.getVideo(id);
            if (!current) return;

            store.upsertVideo({
                ...current,
                filePath: result.filePath,
                status: "QUEUED",
                progress: 100,
            });

            jobs.runProcessingPipeline(id);
        } catch (downloadError) {
            const current = store.getVideo(id);

            if (current) {
                store.upsertVideo({
                    ...current,
                    status: "ERROR",
                    progress: 0,
                    error: downloadError.message,
                });
            }
        }
    } catch (error) {
        return response.status(500).json({
            error: error.message || "Failed to process YouTube URL.",
        });
    }
});

router.get("/:id/youtube", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video) {
        return response.status(404).json({ error: "Video not found." });
    }

    if (video.sourceType !== "youtube") {
        return response.status(400).json({ error: "This video is not a YouTube video." });
    }

    const youtubeId = getYouTubeVideoId(video.sourceUrl);

    if (!youtubeId) {
        return response.status(400).json({ error: "Could not determine the YouTube video ID." });
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
        return response.status(404).json({ error: "Video not found." });
    }

    response.json({
        status: video.status,
        progress: video.progress ?? 0,
        error: video.error || null,
    });
});

router.get("/:id/file", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video || !video.filePath || !fs.existsSync(video.filePath)) {
        return response.status(404).json({ error: "Video file not found." });
    }

    response.sendFile(path.resolve(video.filePath));
});

router.get("/:id", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (!video) {
        return response.status(404).json({ error: "Video not found." });
    }

    response.json(publicVideo(video));
});

export default router;