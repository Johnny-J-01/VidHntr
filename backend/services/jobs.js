import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import store from "./store.js";

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

async function runProcessingPipeline(videoId) {
    try {
        const video = store.getVideo(videoId);

        if (!video) {
            return;
        }

        if (
            !video.filePath ||
            !fs.existsSync(video.filePath)
        ) {
            throw new Error(
                "Source video file was not found."
            );
        }

        store.patchVideo(videoId, {
            status: "PROCESSING",
            progress: 100,
            error: null,
        });

        console.log(
            `Video ${videoId} uploaded successfully.`
        );
    } catch (error) {
        console.error(
            `Video ${videoId} processing failed:`,
            error
        );

        markError(
            videoId,
            error.message || "Processing failed."
        );
    }
}

export default {
    DIRS,
    runProcessingPipeline,
};