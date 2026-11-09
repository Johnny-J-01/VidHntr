import fs from "fs";
import { DRIVE_FOLDER_ID, getDrive } from "./client.js";

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
