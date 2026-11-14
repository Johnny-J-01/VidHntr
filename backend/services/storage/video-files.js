import fs from "fs";
import path from "path";

import {
	downloadFileToPath,
	downloadJsonFile,
	getVideoStorageFolders,
	uploadFile,
	uploadJson,
} from "../google/drive.js";
import { DIRS } from "../video/paths.js";

const VIDEO_MIME_TYPES = new Map([
	[".mp4", "video/mp4"],
	[".mov", "video/quicktime"],
	[".webm", "video/webm"],
	[".mkv", "video/x-matroska"],
]);

function sourceExtension(video) {
	const extension = path.extname(video.filename || video.filePath || "").toLowerCase();
	return VIDEO_MIME_TYPES.has(extension) ? extension : ".mp4";
}

function metadataForVideo(video, transcriptFileId) {
	return {
		videoId: video.id,
		owner: {
			type: video.userId ? "authenticated" : "guest",
			id: video.userId || video.guestId,
		},
		title: video.title,
		sourceType: video.sourceType,
		sourceUrl: video.sourceUrl || null,
		youtubeId: video.youtubeId || null,
		filename: video.filename || null,
		duration: video.duration ?? null,
		status: video.status,
		progress: video.progress ?? 0,
		error: video.error || null,
		createdAt: video.createdAt ? new Date(video.createdAt).toISOString() : null,
		expiresAt: video.expiresAt ? new Date(video.expiresAt).toISOString() : null,
		driveFileId: video.driveFileId || null,
		thumbnailFileId: video.thumbnailFileId || null,
		transcriptFileId: transcriptFileId || video.transcriptFileId || null,
	};
}

export async function storeSourceVideo(video) {
	const folders = await getVideoStorageFolders(video);
	const extension = sourceExtension(video);
	const file = await uploadFile({
		filePath: video.filePath,
		fileName: `${video.id}${extension}`,
		mimeType: VIDEO_MIME_TYPES.get(extension),
		folderId: folders.uploads.id,
		fileId: video.driveFileId || null,
	});

	return { file, folders };
}

export async function storeVideoThumbnail(video, thumbnailPath) {
	const folders = await getVideoStorageFolders(video);
	return uploadFile({
		filePath: thumbnailPath,
		fileName: `${video.id}.jpg`,
		mimeType: "image/jpeg",
		folderId: folders.thumbnails.id,
		fileId: video.thumbnailFileId || null,
	});
}

export async function storeVideoJsonFiles(video, transcript) {
	const folders = await getVideoStorageFolders(video);
	let transcriptFileId = video.transcriptFileId || null;

	if (Array.isArray(transcript)) {
		const transcriptFile = await uploadJson({
			fileId: transcriptFileId,
			folderId: folders.metadata.id,
			fileName: `${video.id}.transcript.json`,
			value: {
				videoId: video.id,
				segments: transcript,
			},
		});
		transcriptFileId = transcriptFile.id;
	}

	const metadataFile = await uploadJson({
		fileId: video.metadataFileId || null,
		folderId: folders.metadata.id,
		fileName: `${video.id}.metadata.json`,
		value: metadataForVideo(video, transcriptFileId),
	});

	return {
		driveFolderId: folders.owner.id,
		metadataFileId: metadataFile.id,
		transcriptFileId,
	};
}

export async function loadVideoTranscript(video) {
	if (Array.isArray(video?.transcript)) return video.transcript;
	if (!video?.transcriptFileId) return null;

	const document = await downloadJsonFile(video.transcriptFileId);
	if (document?.videoId !== video.id || !Array.isArray(document.segments)) {
		throw new Error("The stored transcript does not match the requested video.");
	}

	return document.segments;
}

export async function ensureLocalSourceVideo(video) {
	if (video?.filePath && fs.existsSync(video.filePath)) return video.filePath;
	if (video?.sourceType !== "upload" || !video?.driveFileId) {
		throw new Error("Original uploaded video is not available in Google Drive.");
	}

	const destinationPath = path.join(
		DIRS.uploads,
		`${video.id}${sourceExtension(video)}`,
	);

	return downloadFileToPath(video.driveFileId, destinationPath);
}

export async function storeExportVideo(video, exportJob, outputPath) {
	const folders = await getVideoStorageFolders(video);
	return uploadFile({
		filePath: outputPath,
		fileName: `${exportJob.id}.mp4`,
		mimeType: "video/mp4",
		folderId: folders.exports.id,
		fileId: exportJob.driveFileId || null,
	});
}
