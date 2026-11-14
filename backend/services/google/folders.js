import { DRIVE_FOLDER_ID, getDrive } from "./client.js";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const ROOT_FOLDER_NAME = "VIDHNTR";
const folderPromises = new Map();
const videoFolderPromises = new Map();

export async function findFolder(name, parentId) {
	const drive = getDrive();
	const escapedName = name.replace(/'/g, "\\'");
	const response = await drive.files.list({
		q: `'${parentId}' in parents and name = '${escapedName}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
		fields: "files(id,name,mimeType,parents)",
		pageSize: 10,
	});

	return response.data.files?.[0] || null;
}

export async function createFolder(name, parentId) {
	const drive = getDrive();
	const response = await drive.files.create({
		requestBody: {
			name,
			mimeType: FOLDER_MIME_TYPE,
			parents: [parentId],
		},
		fields: "id,name,mimeType,parents",
	});

	if (!response.data?.id) {
		throw new Error(`Google Drive did not return an ID for folder "${name}".`);
	}

	return response.data;
}

export async function getOrCreateFolder(name, parentId) {
	if (!name) throw new Error("Google Drive folder name is required.");
	if (!parentId) throw new Error("Google Drive parent folder ID is required.");

	const cacheKey = `${parentId}:${name}`;
	if (folderPromises.has(cacheKey)) return folderPromises.get(cacheKey);

	const promise = (async () => {
		const existing = await findFolder(name, parentId);
		return existing || createFolder(name, parentId);
	})().catch((error) => {
		folderPromises.delete(cacheKey);
		throw error;
	});

	folderPromises.set(cacheKey, promise);
	return promise;
}

export function getApplicationRootFolder() {
	return getOrCreateFolder(ROOT_FOLDER_NAME, DRIVE_FOLDER_ID);
}

export function getOwnerStorageIdentity(video) {
	if (!video?.id) throw new Error("Video ID is required for Drive storage.");

	if (video.userId) {
		return {
			groupName: "AUTHENTICATED USERS",
			ownerId: video.userId,
		};
	}

	if (video.guestId) {
		return {
			groupName: "GUEST USERS",
			ownerId: video.guestId,
		};
	}

	throw new Error("A verified video owner is required for Drive storage.");
}

export function getVideoStorageFolders(video) {
	if (!video?.id) throw new Error("Video ID is required for Drive storage.");

	if (videoFolderPromises.has(video.id)) {
		return videoFolderPromises.get(video.id);
	}

	const promise = (async () => {
		const { groupName, ownerId } = getOwnerStorageIdentity(video);
		let ownerFolder;

		if (video.driveFolderId) {
			ownerFolder = { id: video.driveFolderId };
		} else {
			const rootFolder = await getApplicationRootFolder();
			const groupFolder = await getOrCreateFolder(groupName, rootFolder.id);
			ownerFolder = await getOrCreateFolder(ownerId, groupFolder.id);
		}

		const [uploads, metadata, exports, thumbnails] = await Promise.all([
			getOrCreateFolder("UPLOADED VIDEOS", ownerFolder.id),
			getOrCreateFolder("METADATA", ownerFolder.id),
			getOrCreateFolder("EXPORTS", ownerFolder.id),
			getOrCreateFolder("THUMBNAILS", ownerFolder.id),
		]);

		return {
			owner: ownerFolder,
			uploads,
			metadata,
			exports,
			thumbnails,
		};
	})().catch((error) => {
		videoFolderPromises.delete(video.id);
		throw error;
	});

	videoFolderPromises.set(video.id, promise);
	return promise;
}
