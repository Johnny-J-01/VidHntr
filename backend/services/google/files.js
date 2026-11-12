import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { DRIVE_FOLDER_ID, getDrive } from "./client.js";

const FILE_FIELDS =
	"id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents,trashed";

async function sendContent({ fileId, folderId, fileName, mimeType, body }) {
	if (!fileName) throw new Error("Drive upload requires a file name.");
	if (!fileId && !folderId) {
		throw new Error("Drive upload requires a destination folder ID.");
	}

	const drive = getDrive();
	const request = {
		media: { mimeType, body },
		fields: FILE_FIELDS,
	};
	let response;

	if (fileId) {
		response = await drive.files.update({ ...request, fileId });
	} else {
		response = await drive.files.create({
			...request,
			requestBody: { name: fileName, parents: [folderId] },
		});
	}

	if (!response.data?.id) {
		throw new Error("Google Drive returned no file ID after upload.");
	}

	return response.data;
}

export async function uploadFile({
	filePath,
	fileName,
	mimeType,
	folderId = DRIVE_FOLDER_ID,
	fileId = null,
}) {
	if (!filePath) throw new Error("Drive upload requires a file path.");

	const stats = await fsPromises.stat(filePath);
	if (!stats.isFile()) {
		throw new Error(`Drive upload source is not a file: ${filePath}`);
	}

	return sendContent({
		fileId,
		folderId,
		fileName,
		mimeType,
		body: fs.createReadStream(filePath),
	});
}

export function uploadJson({ value, fileName, folderId, fileId = null }) {
	return sendContent({
		fileId,
		folderId,
		fileName,
		mimeType: "application/json",
		body: Readable.from(JSON.stringify(value, null, 2)),
	});
}

export async function getFile(fileId) {
	if (!fileId) throw new Error("Google Drive file ID is required.");

	const response = await getDrive().files.get({
		fileId,
		fields: FILE_FIELDS,
	});

	return response.data;
}

export async function getFileStream(fileId, options = {}) {
	if (!fileId) throw new Error("Google Drive file ID is required.");

	const requestParams = { fileId, alt: "media" };
	const requestOptions = { responseType: "stream" };

	if (options.range) {
		requestOptions.headers = { Range: options.range };
	}

	const response = await getDrive().files.get(requestParams, requestOptions);

	return response.data;
}

export async function downloadJsonFile(fileId) {
	const stream = await getFileStream(fileId);
	const chunks = [];

	for await (const chunk of stream) {
		chunks.push(Buffer.from(chunk));
	}

	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function downloadFileToPath(fileId, destinationPath) {
	const stream = await getFileStream(fileId);
	await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true });

	try {
		await pipeline(stream, fs.createWriteStream(destinationPath));
		return destinationPath;
	} catch (error) {
		await fsPromises.unlink(destinationPath).catch(() => {});
		throw error;
	}
}

export async function deleteFile(fileId) {
	if (!fileId) return true;

	try {
		await getDrive().files.delete({ fileId });
		return true;
	} catch (error) {
		if (error?.response?.status === 404 || error?.code === 404) return true;
		throw error;
	}
}

export async function listFiles(folderId = DRIVE_FOLDER_ID) {
	const drive = getDrive();
	const files = [];
	let pageToken;

	do {
		const response = await drive.files.list({
			q: `'${folderId}' in parents and trashed = false`,
			fields: `files(${FILE_FIELDS}),nextPageToken`,
			orderBy: "createdTime desc",
			pageSize: 100,
			pageToken,
		});

		files.push(...(response.data.files || []));
		pageToken = response.data.nextPageToken || null;
	} while (pageToken);

	return files;
}
