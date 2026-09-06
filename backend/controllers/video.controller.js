import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";

import * as store from "../db/videos.js";
import jobs from "../services/video/processing.js";
import ytdlp from "../services/ytdlp/client.js";
import ai from "../services/ai/client.js";
import { authVideoExpiresAt, guestVideoExpiresAt } from "../services/video/limits.js";
import { deleteVideoResources } from "../services/storage/cleanup.js";

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

function canAccessVideo(request, video) {
	if (!video) return false;

	// Authenticated video: Only the owning user can access
	if (video.userId) {
		return Boolean(request.user && request.user.id === video.userId);
	}

	// Guest video: Viewable by anyone (both guests and logged-in users)
	return true;
}

function canDeleteVideo(request, video) {
	if (!video) return false;

	// Guest uploads cannot be deleted by ANYONE (neither guests nor logged-in users)
	if (!video.userId) {
		return false;
	}

	// Logged-in uploads can ONLY be deleted by their authenticated owner
	return Boolean(request.user && request.user.id === video.userId);
}

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
		expiresAt: video.expiresAt,
		ownerType: video.userId ? "authenticated" : "guest",
		canDelete: false,
	};
}

function requireVideoAccess(request, response, video) {
	if (!video) {
		response.status(404).json({ error: "Video not found." });
		return false;
	}
	if (!canAccessVideo(request, video)) {
		response.status(403).json({ error: "You cannot access this video." });
		return false;
	}
	return true;
}

function publicVideoForRequest(request, video) {
	const result = publicVideo(video);
	return {
		...result,
		canDelete: canDeleteVideo(request, video),
	};
}

function getYouTubeVideoId(url) {
	if (!url || typeof url !== "string") return null;

	try {
		const parsed = new URL(url);

		if (
			["www.youtube.com", "youtube.com", "m.youtube.com"].includes(
				parsed.hostname,
			)
		) {
			const pathname = parsed.pathname;

			if (pathname === "/watch") {
				return parsed.searchParams.get("v");
			}

			if (pathname.startsWith("/embed/")) {
				return pathname.split("/")[2] || null;
			}

			if (pathname.startsWith("/shorts/")) {
				return pathname.split("/")[2] || null;
			}

			if (pathname.startsWith("/live/")) {
				return pathname.split("/")[2] || null;
			}
		}

		if (parsed.hostname === "youtu.be") {
			return parsed.pathname.split("/")[1] || null;
		}

		return null;
	} catch {
		return null;
	}
}

function getTranscriptOrThrow(video) {
	if (!Array.isArray(video.transcript)) {
		const error = new Error(
			"This video is still processing. Try again once it is ready.",
		);

		error.status = 409;

		throw error;
	}

	return video.transcript;
}

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

export const getYouTubeVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	if (video.sourceType !== "youtube") {
		return response
			.status(400)
			.json({ error: "This video is not a YouTube video." });
	}

	const youtubeId =
		video.youtubeId || getYouTubeVideoId(video.sourceUrl);

	if (!youtubeId) {
		return response
			.status(400)
			.json({ error: "Could not determine the YouTube video ID." });
	}

	return response.json({
		videoId: video.id,
		youtubeId,
		sourceUrl: video.sourceUrl,
		embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
	});
};

export const getVideoStatus = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	return response.json({
		status: video.status,
		progress: video.progress ?? 0,
		error: video.error || null,
	});
};

export const getVideoTranscript = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	try {
		const transcript = getTranscriptOrThrow(video);

		return response.json({
			videoId: video.id,
			transcript,
		});
	} catch (error) {
		return response.status(error.status || 500).json({
			error: error.message || "Failed to load transcript.",
		});
	}
};

export const getVideoFile = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	if (!video.filePath) {
		return response.status(404).json({
			error: "Video file not found.",
		});
	}

	return response.sendFile(path.resolve(video.filePath));
};

export const getVideoThumbnail = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	if (!video.thumbnailPath) {
		return response.status(404).end();
	}

	return response.sendFile(path.resolve(video.thumbnailPath));
};

export const searchVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	try {
		const transcript = getTranscriptOrThrow(video);
		const { query, mood } = request.body || {};

		let results;

		if (mood) {
			results = await ai.searchByMood(
				transcript,
				mood,
				video.duration || 0,
			);
		} else {
			if (!query || !query.trim()) {
				return response
					.status(400)
					.json({ error: "Enter something to search for." });
			}

			results = await ai.semanticSearch(
				transcript,
				query.trim(),
				video.duration || 0,
			);
		}

		return response.json({
			videoId: video.id,
			query: query || mood,
			results,
		});
	} catch (error) {
		return response.status(error.status || 500).json({
			error:
				error.message ||
				"Something went wrong while searching this video.",
		});
	}
};

export const getVideoSuggestions = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	try {
		const transcript = getTranscriptOrThrow(video);

		const suggestions = await ai.suggestClips(
			transcript,
			video.duration || 0,
		);

		return response.json({
			videoId: video.id,
			suggestions,
		});
	} catch (error) {
		return response.status(error.status || 500).json({
			error:
				error.message ||
				"Something went wrong while analyzing this video.",
		});
	}
};

export const getVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!requireVideoAccess(request, response, video)) return;

	return response.json(publicVideoForRequest(request, video));
};