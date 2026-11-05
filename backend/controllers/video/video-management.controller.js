import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";

import * as store from "../../db/videos.js";
import jobs from "../../services/video/processing.js";
import ytdlp from "../../services/ytdlp/client.js";
import { authVideoExpiresAt, guestVideoExpiresAt } from "../../services/video/limits.js";
import { deleteVideoResources } from "../../services/storage/cleanup.js";
import {
	canAccessVideo,
	canDeleteVideo,
	getYouTubeVideoId,
	publicVideoForRequest,
} from "./video-helpers.js";

const ALLOWED_MIME = new Set([
	"video/mp4",
	"video/quicktime",
	"video/webm",
	"video/x-matroska",
]);

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

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

export async function reserveUploadVideo(request, response, next) {
	try {
		const reservation = await reserveVideo(request, "upload");
		if (!reservation.allowed) return sendLimitReached(response, reservation);

		request.videoReservation = reservation;
		request.videoId = reservation.id;
		return next();
	} catch (error) {
		return next(error);
	}
}

const upload = multer({
	storage: multer.diskStorage({
		destination: (request, file, callback) =>
			callback(null, jobs.DIRS.uploads),

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
			callback(
				new Error("Unsupported file type. Upload MP4, MOV, or WebM."),
			);
			return;
		}

		callback(null, true);
	},
});

export const uploadVideo = (request, response) => {
	upload.single("video")(request, response, async (error) => {
		if (error) {
			if (request.videoId) await releaseReservation(request.videoId);
			return response
				.status(400)
				.json({ error: error.message || "Upload failed." });
		}

		if (!request.file) {
			await releaseReservation(request.videoId);
			return response
				.status(400)
				.json({ error: "No video file was provided." });
		}

		const { id, userId, guestId, createdAt, expiresAt } = request.videoReservation;

		const title = (
			request.body.title ||
			request.file.originalname ||
			"Untitled video"
		).replace(/\.[^/.]+$/, "");

		const video = {
			id,
			userId,
			guestId,
			title,
			sourceType: "upload",
			sourceUrl: null,
			filename: request.file.originalname,

			filePath: request.file.path,
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
		} catch (storeError) {
			await releaseReservation(id);
			console.error(`Failed to create video ${id}:`, storeError);
			return response.status(500).json({ error: "Failed to create video." });
		}

		jobs.runProcessingPipeline(id);

		return response.status(202).json({
			videoId: id,
			status: "queued",
		});
	});
};

export const listVideos = async (request, response) => {
	const videos = await store.listVideos();
	response.json(
		videos
			.filter((video) => canAccessVideo(request, video))
			.map((video) => publicVideoForRequest(request, video)),
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
