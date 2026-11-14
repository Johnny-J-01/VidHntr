import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";

import * as store from "../../db/videos.js";
import jobs from "../../services/video/processing.js";
import ytdlp from "../../services/ytdlp/client.js";
import { authVideoExpiresAt, guestVideoExpiresAt } from "../../services/video/limits.js";
import {
	getYouTubeIngestionDisabledResponse,
	isYouTubeIngestionEnabled,
} from "../../services/video/youtube-ingestion-config.js";
import { deleteVideoResources } from "../../services/storage/cleanup.js";
import {
	finalizeLocalUpload,
	getTemporaryUploadPath,
	MAX_UPLOAD_SIZE_BYTES,
	removeLocalFile,
	saveUploadedVideo,
	UPLOAD_FORMATS,
} from "../../services/video/local-upload.js";
import {
	canDeleteVideo,
	getYouTubeVideoId,
	publicVideoForRequest,
} from "./video-helpers.js";

async function reserveVideo(request, sourceType) {
	const id = uuid();
	const createdAt = Date.now();
	const userId = request.user?.id ?? null;
	const guestId = userId ? null : request.guestId;
	const expiresAt = userId ? authVideoExpiresAt(createdAt) : guestVideoExpiresAt(createdAt);
	const reservation = await store.reserveVideoSlot({
		id,
		userId,
		guestId,
		sourceType,
		expiresAt,
	});

	return { id, userId, guestId, createdAt, expiresAt, ...reservation };
}

function sendLimitReached(response, reservation) {
	return response.status(429).json({
		error: "Video limit reached.",
		code: "VIDEO_LIMIT_REACHED",
		ownerType: reservation.userId ? "authenticated" : "guest",
		limit: reservation.video_limit,
	});
}

async function releaseReservation(id) {
	try {
		await store.deleteVideo(id);
	} catch (error) {
		console.error(`Failed to release video reservation ${id}:`, error);
	}
}

async function cleanupTemporaryUpload(request) {
	try {
		await removeLocalFile(request.uploadTemporaryPath);
	} catch (error) {
		console.error(`Failed to remove incomplete upload ${request.videoId}:`, error);
	}
}

function resolveUploadMimeType(file) {
	if (UPLOAD_FORMATS.has(file.mimetype)) return file.mimetype;

	const mimeTypeByExtension = {
		".mp4": "video/mp4",
		".mov": "video/quicktime",
		".webm": "video/webm",
		".mkv": "video/x-matroska",
	};

	return mimeTypeByExtension[path.extname(file.originalname || "").toLowerCase()] || null;
}

function sendUploadError(response, error) {
	const isTooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
	const status = isTooLarge ? 413 : error.status || 400;
	const message = isTooLarge
		? "The uploaded video exceeds the 2 GB limit."
		: error.message || "Upload failed.";

	return response.status(status).json({ error: message });
}

export async function reserveUploadVideo(request, response, next) {
	try {
		const reservation = await reserveVideo(request, "upload");
		if (!reservation.allowed) return sendLimitReached(response, reservation);

		request.videoReservation = reservation;
		request.videoId = reservation.id;
		request.uploadTemporaryPath = getTemporaryUploadPath(
			jobs.DIRS.incomingUploads,
			reservation.id,
		);

		request.once("aborted", () => {
			void cleanupTemporaryUpload(request);
			void releaseReservation(reservation.id);
		});

		return next();
	} catch (error) {
		return next(error);
	}
}

const upload = multer({
	storage: multer.diskStorage({
		destination: (request, file, callback) =>
			callback(null, jobs.DIRS.incomingUploads),

		filename: (request, file, callback) => {
			const id = request.videoId || (request.videoId = uuid());
			request.uploadTemporaryPath = getTemporaryUploadPath(
				jobs.DIRS.incomingUploads,
				id,
			);
			callback(null, path.basename(request.uploadTemporaryPath));
		},
	}),

	limits: {
		fileSize: MAX_UPLOAD_SIZE_BYTES,
	},

	fileFilter: (request, file, callback) => {
		const mimeType = resolveUploadMimeType(file);
		if (!mimeType) {
			callback(
				new Error("Unsupported file type. Upload MP4, MOV, WebM, or MKV."),
			);
			return;
		}

		file.mimetype = mimeType;
		callback(null, true);
	},
});

export const uploadVideo = (request, response) => {
	upload.single("video")(request, response, async (error) => {
		if (error) {
			await cleanupTemporaryUpload(request);
			if (request.videoId) await releaseReservation(request.videoId);
			return sendUploadError(response, error);
		}

		if (!request.file) {
			await cleanupTemporaryUpload(request);
			await releaseReservation(request.videoId);
			return response
				.status(400)
				.json({ error: "No video file was provided." });
		}

		const { id, userId, guestId, createdAt, expiresAt } = request.videoReservation;
		let filePath = null;

		try {
			filePath = await finalizeLocalUpload({
				temporaryPath: request.file.path,
				uploadDirectory: jobs.DIRS.uploads,
				videoId: id,
				mimeType: request.file.mimetype,
			});
		} catch (validationError) {
			await cleanupTemporaryUpload(request);
			await releaseReservation(id);
			return sendUploadError(response, validationError);
		}

		const title = (
			request.body.title ||
			request.file.originalname ||
			"Untitled video"
		).replace(/\.[^/.]+$/, "").trim().slice(0, 200) || "Untitled video";

		const video = {
			id,
			userId,
			guestId,
			title,
			sourceType: "upload",
			sourceUrl: null,
			filename: request.file.originalname,

			filePath,
			thumbnailPath: null,
			duration: null,

			status: "QUEUED",
			progress: 0,

			transcript: null,
			transcriptPath: null,

			createdAt,
			expiresAt,
		};

		try {
			await saveUploadedVideo({
				video,
				saveVideo: store.upsertVideo,
				releaseReservation,
				onCleanupFailure: (cleanupError) => {
					console.error(`Failed to remove uploaded file ${id} after database failure:`, cleanupError);
				},
			});
		} catch (storeError) {
			console.error(`Failed to create video ${id}:`, storeError);
			return response.status(500).json({ error: "Failed to create video." });
		}

		void jobs.runProcessingPipeline(id);

		return response.status(202).json({
			videoId: id,
			status: "queued",
		});
	});
};

export const listVideos = async (request, response) => {
	const videos = await store.listVideos({
		userId: request.user?.id ?? null,
		guestId: request.user ? null : request.guestId,
	});

	response.json(
		videos.map((video) => publicVideoForRequest(request, video)),
	);
};

export const deleteVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!video) {
		return response.status(404).json({ error: "Video not found." });
	}

	if (!canDeleteVideo(request, video)) {
		return response.status(403).json({ error: "You cannot delete this video." });
	}

	try {
		await deleteVideoResources(video);
		await store.deleteVideo(video.id);
		store.clearRuntimeVideo(video.id);
		return response.status(204).end();
	} catch (error) {
		console.error(`Failed to delete video ${video.id}:`, error);
		return response.status(500).json({ error: "Video deletion failed." });
	}
};

export const createYouTubeVideo = async (request, response) => {
	const { url } = request.body || {};

	if (!ytdlp.isValidYouTubeUrl(url)) {
		return response
			.status(400)
			.json({ error: "That doesn't look like a valid YouTube URL." });
	}

	if (!isYouTubeIngestionEnabled()) {
		return response.status(403).json(getYouTubeIngestionDisabledResponse());
	}

	const reservation = await reserveVideo(request, "youtube");
	if (!reservation.allowed) return sendLimitReached(response, reservation);

	const { id, userId, guestId, createdAt, expiresAt } = reservation;
	const youtubeId = getYouTubeVideoId(url);

	const video = {
		id,
		userId,
		guestId,
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

		createdAt,
		expiresAt,
	};

	try {
		await store.upsertVideo(video);
	} catch (error) {
		await releaseReservation(id);
		console.error(`Failed to create video ${id}:`, error);
		return response.status(500).json({ error: "Failed to create video." });
	}

	jobs.runYouTubePipeline(id, url);

	return response.status(202).json({
		videoId: id,
		status: "queued",
	});
};
