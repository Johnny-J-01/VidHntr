import fs from "fs/promises";
import path from "path";

export const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

export const UPLOAD_FORMATS = new Map([
	["video/mp4", { extension: ".mp4", container: "iso-bmff" }],
	["video/quicktime", { extension: ".mov", container: "iso-bmff" }],
	["video/webm", { extension: ".webm", container: "webm" }],
	["video/x-matroska", { extension: ".mkv", container: "matroska" }],
]);

function uploadValidationError(message) {
	const error = new Error(message);
	error.status = 400;
	return error;
}

function hasEbmlHeader(buffer) {
	return buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
}

function hasIsoBmffHeader(buffer) {
	return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
}

function matchesContainer(buffer, container) {
	if (container === "iso-bmff") return hasIsoBmffHeader(buffer);

	const headerText = buffer.toString("ascii").toLowerCase();
	if (container === "webm") return hasEbmlHeader(buffer) && headerText.includes("webm");
	if (container === "matroska") return hasEbmlHeader(buffer) && headerText.includes("matroska");

	return false;
}

export async function removeLocalFile(filePath) {
	if (!filePath) return;

	try {
		await fs.unlink(filePath);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
}

export async function saveUploadedVideo({
	video,
	saveVideo,
	releaseReservation,
	onCleanupFailure = () => {},
}) {
	try {
		return await saveVideo(video);
	} catch (error) {
		try {
			await removeLocalFile(video.filePath);
		} catch (cleanupError) {
			onCleanupFailure(cleanupError);
		}

		await releaseReservation(video.id);
		throw error;
	}
}

export async function finalizeLocalUpload({
	temporaryPath,
	uploadDirectory,
	videoId,
	mimeType,
	maximumSizeBytes = MAX_UPLOAD_SIZE_BYTES,
}) {
	const format = UPLOAD_FORMATS.get(mimeType);
	if (!format) {
		throw uploadValidationError("Unsupported file type. Upload MP4, MOV, WebM, or MKV.");
	}

	const stats = await fs.stat(temporaryPath);
	if (stats.size <= 0) throw uploadValidationError("The uploaded video is empty.");
	if (stats.size > maximumSizeBytes) {
		throw uploadValidationError("The uploaded video exceeds the 2 GB limit.");
	}

	const handle = await fs.open(temporaryPath, "r");
	let header;
	try {
		header = Buffer.alloc(Math.min(4096, stats.size));
		await handle.read(header, 0, header.length, 0);
	} finally {
		await handle.close();
	}

	if (!matchesContainer(header, format.container)) {
		throw uploadValidationError("The file contents do not match the selected video type.");
	}

	const finalPath = path.join(uploadDirectory, `${videoId}${format.extension}`);
	await fs.rename(temporaryPath, finalPath);
	return finalPath;
}

export function getTemporaryUploadPath(uploadDirectory, videoId) {
	return path.join(uploadDirectory, `${videoId}.uploading`);
}
