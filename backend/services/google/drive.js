export { DRIVE_FOLDER_ID, getDrive } from "./client.js";
export {
	getApplicationRootFolder,
	getOrCreateFolder,
	getOwnerStorageIdentity,
	getVideoStorageFolders,
} from "./folders.js";
export {
	deleteFile,
	downloadFileToPath,
	downloadJsonFile,
	getFile,
	getFileStream,
	listFiles,
	uploadFile,
	uploadJson,
} from "./files.js";

import { getDrive } from "./client.js";
export default getDrive;
