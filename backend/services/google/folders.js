import { DRIVE_FOLDER_ID, getDrive } from "./client.js";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export async function findFolder(name, parentId) {
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

export async function createFolder(
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
