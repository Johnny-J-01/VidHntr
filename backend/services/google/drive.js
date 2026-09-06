import { google } from "googleapis";
import fs from "fs";

import { getAuthenticatedClient } from "./auth.js";

export const DRIVE_FOLDER_ID =
	"1KvDIRNFB4JQCZ4DmTBd77RZ3M2rwvNcD";

const FOLDER_MIME_TYPE =
	"application/vnd.google-apps.folder";

function getDrive() {
	const auth = getAuthenticatedClient();

	if (!auth) {
		throw new Error(
			"Google Drive is not authorized.",
		);
	}

	return google.drive({
		version: "v3",
		auth,
	});
}

async function findFolder(name, parentId) {
	const drive = getDrive();

	const escapedName = name.replace(/'/g, "\\'");

	const response =
		await drive.files.list({
			q: `'${parentId}' in parents and name = '${escapedName}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,

			fields:
				"files(id,name,mimeType,parents)",

			pageSize: 10,
		});

	return response.data.files?.[0] || null;
}

async function createFolder(
	name,
	parentId,
) {
	const drive = getDrive();

	console.log(
		`Creating Google Drive folder "${name}" inside ${parentId}`,
	);

	const response =
		await drive.files.create({
			requestBody: {
				name,
				mimeType: FOLDER_MIME_TYPE,
				parents: [parentId],
			},

			fields:
				"id,name,mimeType,parents",
		});

	if (!response.data?.id) {
		throw new Error(
			`Google Drive did not return an ID for folder "${name}".`,
		);
	}

	console.log(
		`Created Google Drive folder "${name}" (${response.data.id})`,
	);

	return response.data;
}

export const getOrCreateFolder = async (
	name,
	parentId,
) => {
	if (!name) {
		throw new Error(
			"Google Drive folder name is required.",
		);
	}

	if (!parentId) {
		throw new Error(
			"Google Drive parent folder ID is required.",
		);
	}

	const existing =
		await findFolder(name, parentId);

	if (existing) {
		console.log(
			`Using existing Google Drive folder "${name}" (${existing.id})`,
		);

		return existing;
	}

	return createFolder(name, parentId);
};

export const getGuestVideoFolder = async (
	videoId,
) => {
	if (!videoId) {
		throw new Error(
			"Video ID is required for Drive storage.",
		);
	}

	console.log(
		`Preparing Google Drive folder for video: ${videoId}`,
	);

	console.log(
		`Drive root folder: ${DRIVE_FOLDER_ID}`,
	);

	const guestsFolder =
		await getOrCreateFolder(
			"guests",
			DRIVE_FOLDER_ID,
		);

	if (!guestsFolder?.id) {
		throw new Error(
			"Could not create or locate the Google Drive guests folder.",
		);
	}

	console.log(
		`Google Drive guests folder ready: ${guestsFolder.id}`,
	);

	const videoFolder =
		await getOrCreateFolder(
			videoId,
			guestsFolder.id,
		);

	if (!videoFolder?.id) {
		throw new Error(
			`Could not create or locate Google Drive folder for video ${videoId}.`,
		);
	}

	console.log(
		`Google Drive video folder ready: ${videoFolder.id}`,
	);

	return videoFolder;
};

export const uploadFile = async ({
	filePath,
	fileName,
	mimeType,
	folderId = DRIVE_FOLDER_ID,
}) => {
	if (!filePath) {
		throw new Error(
			"Drive upload requires a file path.",
		);
	}

	if (!fs.existsSync(filePath)) {
		throw new Error(
			`Drive upload source file does not exist: ${filePath}`,
		);
	}

	if (!fileName) {
		throw new Error(
			"Drive upload requires a file name.",
		);
	}

	if (!folderId) {
		throw new Error(
			"Drive upload requires a destination folder ID.",
		);
	}

	const stats =
		fs.statSync(filePath);

	if (!stats.isFile()) {
		throw new Error(
			`Drive upload source is not a file: ${filePath}`,
		);
	}

	const drive = getDrive();

	console.log(
		`----------------------------------------------`,
	);

	console.log(
		`Uploading "${fileName}" to Google Drive`,
	);

	console.log(
		`Local file: ${filePath}`,
	);

	console.log(
		`File size: ${stats.size} bytes`,
	);

	console.log(
		`Destination folder: ${folderId}`,
	);

	const response =
		await drive.files.create({
			requestBody: {
				name: fileName,
				parents: [folderId],
			},

			media: {
				mimeType,
				body: fs.createReadStream(
					filePath,
				),
			},

			fields:
				"id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents",
		});

	if (!response.data?.id) {
		throw new Error(
			"Google Drive returned no file ID after upload.",
		);
	}

	console.log(
		`Google Drive upload successful: ${response.data.name} (${response.data.id})`,
	);

	console.log(
		`Google Drive parent folder: ${
			response.data.parents?.[0] ||
			folderId
		}`,
	);

	console.log(
		`Google Drive web view: ${
			response.data.webViewLink ||
			"not available"
		}`,
	);

	console.log(
		`----------------------------------------------`,
	);

	return response.data;
};

export const getFile = async (
	fileId,
) => {
	if (!fileId) {
		throw new Error(
			"Google Drive file ID is required.",
		);
	}

	const drive = getDrive();

	const response =
		await drive.files.get({
			fileId,

			fields:
				"id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents",
		});

	return response.data;
};

export const deleteFile = async (
	fileId,
) => {
	if (!fileId) {
		return true;
	}

	const drive = getDrive();

	await drive.files.delete({
		fileId,
	});

	return true;
};

export const listFiles = async (
	folderId = DRIVE_FOLDER_ID,
) => {
	const drive = getDrive();

	const response =
		await drive.files.list({
			q: `'${folderId}' in parents and trashed = false`,

			fields:
				"files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents)",

			orderBy: "createdTime desc",
		});

	return response.data.files || [];
};

export default getDrive;