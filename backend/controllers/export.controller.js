import { v4 as uuid } from "uuid";
import fs from "fs";

import store from "../services/store.js";
import jobs from "../services/export/processing.js";

const QUALITIES = new Set(["low", "medium", "high", "maximum"]);
const CROP_MODES = new Set(["fill", "fit"]);

export const createExport = (request, response) => {
    const { videoId, start, end, name, width, height, quality = "high", captions = "off", cropMode = "fill" } = request.body || {};
    const video = store.getVideo(videoId);
    if (!video) return response.status(404).json({ error: "Video not found." });

    const clipStart = Number(start);
    const clipEnd = Number(end);
    const outputWidth = Number(width);
    const outputHeight = Number(height);
    if (!Number.isFinite(clipStart) || !Number.isFinite(clipEnd) || clipEnd <= clipStart) return response.status(400).json({ error: "Invalid clip range." });
    if (!Number.isInteger(outputWidth) || outputWidth <= 0 || !Number.isInteger(outputHeight) || outputHeight <= 0) return response.status(400).json({ error: "Invalid export dimensions." });
    if (!QUALITIES.has(quality)) return response.status(400).json({ error: "Invalid export quality." });
    if (captions !== "off" && captions !== "burn") return response.status(400).json({ error: "Invalid captions mode." });
    if (!CROP_MODES.has(cropMode)) return response.status(400).json({ error: "Invalid crop mode." });
    if (video.duration && clipEnd > Number(video.duration)) return response.status(400).json({ error: "Clip end exceeds video duration." });

    const exportId = uuid();
    store.upsertExport({
        id: exportId, videoId, start: clipStart, end: clipEnd,
        filenameBase: name || video.title || "clip", width: outputWidth, height: outputHeight,
        quality, captions, cropMode, status: "QUEUED", progress: 0, outputPath: null,
        filename: null, error: null, createdAt: Date.now(),
    });
    response.status(202).json({ exportId, status: "queued" });
    jobs.runExportJob(exportId);
};

export const getExportStatus = (request, response) => {
    const exp = store.getExport(request.params.id);
    if (!exp) return response.status(404).json({ error: "Export not found." });
    response.json({ exportId: exp.id, status: exp.status, progress: exp.progress ?? 0, filename: exp.filename || null, error: exp.error || null });
};

export const downloadExport = (request, response) => {
    const exp = store.getExport(request.params.id);
    if (!exp) return response.status(404).json({ error: "Export not found." });
    if (exp.status !== "READY") return response.status(409).json({ error: "Export is not ready yet." });
    if (!exp.outputPath || !fs.existsSync(exp.outputPath)) return response.status(404).json({ error: "Export file not found." });
    response.download(exp.outputPath, exp.filename || "clip.mp4");
};
