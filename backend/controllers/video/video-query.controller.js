import fs from "fs";
import path from "path";

import * as store from "../../db/videos.js";
import { getFile, getFileStream } from "../../services/google/drive.js";
import {
	createPlaybackTicket,
	verifyPlaybackTicket,
} from "../../services/video/playback-auth.js";
import {
	getTranscriptOrThrow,
	getYouTubeVideoId,
	publicVideoForRequest,
	requireVideoAccess,
} from "./video-helpers.js";

export const getYouTubeVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!(await requireVideoAccess(request, response, video))) return;

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

	if (!(await requireVideoAccess(request, response, video))) return;

	return response.json({
		status: video.status,
		storageStatus: video.storageStatus || null,
		transcriptionStatus: video.transcriptionStatus || null,
		thumbnailStatus: video.thumbnailStatus || null,
		progress: video.progress ?? 0,
		error: video.error || null,
	});
};

export const getVideoTranscript = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!(await requireVideoAccess(request, response, video))) return;

	try {
		const transcript = await getTranscriptOrThrow(video);

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

export const getVideoPlaybackTicket = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!(await requireVideoAccess(request, response, video))) return;

	const ticket = createPlaybackTicket({
		videoId: video.id,
		userId: request.user?.id || null,
		guestId: request.guestId || null,
		ttlSeconds: 3600,
	});

	return response.json({
		videoId: video.id,
		ticket,
		playbackUrl: `/api/videos/${video.id}/file?ticket=${encodeURIComponent(ticket)}`,
	});
};

export const getVideoFile = async (request, response) => {
	const { id } = request.params;

	// Check if request is authenticated by a signed playback ticket
	if (request.query.ticket) {
		const ticketData = verifyPlaybackTicket(request.query.ticket, id);
		if (ticketData) {
			if (ticketData.userId) {
				request.user = { id: ticketData.userId };
				request.guestId = null;
			} else if (ticketData.guestId) {
				request.user = null;
				request.guestId = ticketData.guestId;
			}
		} else {
			return response.status(401).json({ error: "Invalid or expired playback ticket." });
		}
	}

	const video = await store.getVideo(id);

	if (!(await requireVideoAccess(request, response, video))) return;

	// 1. If local original file exists, use sendFile with native range support
	if (video.filePath && fs.existsSync(video.filePath)) {
		return response.sendFile(path.resolve(video.filePath), { acceptRanges: true });
	}

	// 2. Otherwise stream from Google Drive with full HTTP Range support
	if (!video.driveFileId) {
		return response.status(404).json({
			error: "Video file not found.",
		});
	}

	let fileMeta;
	try {
		fileMeta = await getFile(video.driveFileId);
	} catch (metaError) {
		console.error(`Failed to fetch Drive metadata for video ${id}:`, metaError);
		return response.status(500).json({ error: "Failed to access video storage." });
	}

	const totalSize = Number(fileMeta.size);
	const mimeType = fileMeta.mimeType || "video/mp4";
	const rangeHeader = request.headers.range;

	// No Range requested: stream entire file
	if (!rangeHeader) {
		response.writeHead(200, {
			"Content-Length": totalSize,
			"Content-Type": mimeType,
			"Accept-Ranges": "bytes",
		});

		try {
			const stream = await getFileStream(video.driveFileId);
			stream.on("error", (error) => {
				if (!response.headersSent) response.status(500).end();
				else response.destroy(error);
			});
			response.on("close", () => stream.destroy?.());
			return stream.pipe(response);
		} catch (streamError) {
			if (!response.headersSent) response.status(500).end();
			return;
		}
	}

	// Range requested: validate and process range
	const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
	if (!match) {
		response.setHeader("Content-Range", `bytes */${totalSize}`);
		return response.status(416).end();
	}

	let start = match[1] ? parseInt(match[1], 10) : NaN;
	let end = match[2] ? parseInt(match[2], 10) : NaN;

	if (isNaN(start) && isNaN(end)) {
		response.setHeader("Content-Range", `bytes */${totalSize}`);
		return response.status(416).end();
	}

	if (isNaN(start)) {
		// Suffix range: bytes=-500
		start = Math.max(0, totalSize - end);
		end = totalSize - 1;
	} else if (isNaN(end)) {
		// Open range: bytes=500-
		end = totalSize - 1;
	}

	if (start > end || start >= totalSize || end >= totalSize || start < 0) {
		response.setHeader("Content-Range", `bytes */${totalSize}`);
		return response.status(416).end();
	}

	const chunkSize = end - start + 1;

	response.writeHead(206, {
		"Content-Range": `bytes ${start}-${end}/${totalSize}`,
		"Accept-Ranges": "bytes",
		"Content-Length": chunkSize,
		"Content-Type": mimeType,
	});

	try {
		const stream = await getFileStream(video.driveFileId, {
			range: `bytes=${start}-${end}`,
		});

		stream.on("error", (error) => {
			if (!response.headersSent) response.status(500).end();
			else response.destroy(error);
		});
		response.on("close", () => stream.destroy?.());
		return stream.pipe(response);
	} catch (streamError) {
		if (!response.headersSent) response.status(500).end();
	}
};

export const getVideoThumbnail = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!(await requireVideoAccess(request, response, video))) return;

	if (video.thumbnailPath && fs.existsSync(video.thumbnailPath)) {
		return response.sendFile(path.resolve(video.thumbnailPath));
	}

	if (!video.thumbnailFileId) {
		return response.status(404).end();
	}

	response.type("image/jpeg");
	const stream = await getFileStream(video.thumbnailFileId);
	stream.on("error", (error) => response.destroy(error));
	return stream.pipe(response);
};

export const getVideo = async (request, response) => {
	const video = await store.getVideo(request.params.id);

	if (!(await requireVideoAccess(request, response, video))) return;

	return response.json(publicVideoForRequest(request, video));
};
