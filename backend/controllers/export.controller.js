import { v4 as uuid } from "uuid";

import * as videos from "../db/videos.js";
import * as store from "../db/exports.js";
import jobs, {
	deleteTemporaryExportFiles,
} from "../services/export/processing.js";
import { getFileStream } from "../services/google/drive.js";
import { deleteExportCompletely } from "../services/storage/cleanup.js";
import {
	EXPORT_EXPIRED_MESSAGE,
	hasExpired,
} from "../services/storage/retention.js";
import {
	canAccessExport,
	requireVideoAccess,
} from "./video/video-helpers.js";

const QUALITIES = new Set(["low", "medium", "high", "maximum"]);
const CROP_MODES = new Set(["fill", "fit"]);

export async function requireExportAccess(request, response, exp) {
	if (!exp) {
		response.status(404).json({ error: "Export not found." });
		return null;
	}

	const video = await videos.getVideo(exp.videoId);
	if (!video) {
		response.status(404).json({ error: "Associated video not found." });
		return null;
	}

	if (!canAccessExport(request, exp, video)) {
		response.status(403).json({ error: "You cannot access this export." });
		return null;
	}

	if (!(await requireVideoAccess(request, response, video))) return null;

	if (hasExpired(exp.expiresAt) || exp.status === "EXPIRED") {
		try {
			await deleteExportCompletely(exp);
		} catch (error) {
			console.error(`Failed to clean expired export ${exp.id}:`, error);
		}

		response.status(410).json({
			error: EXPORT_EXPIRED_MESSAGE,
			code: "EXPORT_EXPIRED",
		});
		return null;
	}

	return video;
}

export const createExport = async (request, response) => {
	const {
		videoId,
		start,
		end,
		name,
		width,
		height,
		quality = "high",
		captions = "off",
		cropMode = "fill",
	} = request.body || {};

	const video = await videos.getVideo(videoId);

	if (!(await requireVideoAccess(request, response, video))) return;

	const clipStart = Number(start);
	const clipEnd = Number(end);
	const outputWidth = Number(width);
	const outputHeight = Number(height);

	if (
		!Number.isFinite(clipStart) ||
		!Number.isFinite(clipEnd) ||
		clipEnd <= clipStart
	) {
		return response.status(400).json({
			error: "Invalid clip range.",
		});
	}

	if (
		!Number.isInteger(outputWidth) ||
		outputWidth <= 0 ||
		!Number.isInteger(outputHeight) ||
		outputHeight <= 0
	) {
		return response.status(400).json({
			error: "Invalid export dimensions.",
		});
	}

	if (!QUALITIES.has(quality)) {
		return response.status(400).json({
			error: "Invalid export quality.",
		});
	}

	if (captions !== "off" && captions !== "burn") {
		return response.status(400).json({
			error: "Invalid captions mode.",
		});
	}

	if (!CROP_MODES.has(cropMode)) {
		return response.status(400).json({
			error: "Invalid crop mode.",
		});
	}

	if (video.duration && clipEnd > Number(video.duration)) {
		return response.status(400).json({
			error: "Clip end exceeds video duration.",
		});
	}

	if (video.status !== "READY") {
		return response.status(409).json({
			error: "This video is not ready for export yet.",
		});
	}

	const exportId = uuid();

	await store.upsertExport({
		id: exportId,
		videoId,
		userId: video.userId ?? null,
		guestId: video.guestId ?? null,
		start: clipStart,
		end: clipEnd,
		filenameBase: name || video.title || "clip",
		width: outputWidth,
		height: outputHeight,
		quality,
		captions,
		cropMode,
		status: "QUEUED",
		progress: 0,
		outputPath: null,
		filename: null,
		error: null,
		createdAt: Date.now(),
		expiresAt: null,
	});

	response.status(202).json({
		exportId,
		status: "queued",
	});

	jobs.runExportJob(exportId);
};

export const getExportStatus = async (request, response) => {
	const exp = await store.getExport(request.params.id);

	if (!(await requireExportAccess(request, response, exp))) return;

	response.json({
		exportId: exp.id,
		status: exp.status,
		progress: exp.progress ?? 0,
		filename: exp.filename || null,
		expiresAt: exp.expiresAt || null,
		error: exp.error || null,
	});
};

export const downloadExport = async (request, response) => {
	const exp = await store.getExport(request.params.id);

	if (!(await requireExportAccess(request, response, exp))) return;

	if (exp.status !== "READY") {
		return response.status(409).json({
			error: "Export is not ready yet.",
		});
	}

	if (!exp.driveFileId) {
		return response.status(404).json({
			error: "Export file not found.",
		});
	}

	response.attachment(exp.filename || "clip.mp4");
	const stream = await getFileStream(exp.driveFileId);
	stream.on("error", (error) => response.destroy(error));
	return stream.pipe(response);
};

export const cleanupTemporaryExports = async (request, response) => {
	const { videoId } = request.params;

	try {
		const video = await videos.getVideo(videoId);
		if (!(await requireVideoAccess(request, response, video))) return;

		const exports = await store.listExportsByVideoId(videoId);

		let cleaned = 0;
		for (const exportJob of exports) {
			if (exportJob.status !== "READY" && exportJob.status !== "FAILED") {
				continue;
			}

			deleteTemporaryExportFiles(exportJob.id);
			cleaned += 1;
		}

		return response.json({ success: true, cleaned });
	} catch (error) {
		console.error(
			`Failed to clean temporary exports for video ${videoId}:`,
			error,
		);

		return response.status(500).json({
			success: false,
			error: "Failed to clean temporary export files.",
		});
	}
};