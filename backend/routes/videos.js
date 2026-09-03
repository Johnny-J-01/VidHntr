import express from "express";
import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";
import fs from "fs";

import store from "../services/store.js";
import jobs from "../services/jobs.js";

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
        destination: (request, file, callback) => {
            callback(null, jobs.DIRS.uploads);
        },

        filename: (request, file, callback) => {
            const id = request.videoId || (request.videoId = uuid());
            const ext = path.extname(file.originalname) || ".mp4";
            callback(null, `${id}${ext}`);
        },
    }),

    limits: {
        fileSize: MAX_SIZE_BYTES,
    },

    fileFilter: (request, file, callback) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
            callback( new Error( "Unsupported file type. Upload MP4, MOV, or WebM."));
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
    const videos = store.listVideos();
    response.json(videos.map(publicVideo));
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

router.get("/:id/file", (request, response) => {
    const video = store.getVideo(request.params.id);

    if (
        !video ||
        !video.filePath ||
        !fs.existsSync(video.filePath)
    ) {
        return response.status(404).json({
            error: "Video file not found.",
        });
    }

    response.sendFile(path.resolve(video.filePath));
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