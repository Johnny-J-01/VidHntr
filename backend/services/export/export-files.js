import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isFileLocked } from "../video/file-locks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, "..", "..", "storage");

export const DIRS = {
	uploads: path.join(STORAGE, "uploads"),
	exports: path.join(STORAGE, "exports"),
};

Object.values(DIRS).forEach((directory) => {
	fs.mkdirSync(directory, {
		recursive: true,
	});
});

export function getExportWorkDir(exportId) {
	if (!exportId) return DIRS.exports;
	const workDir = path.join(DIRS.exports, exportId);
	if (!fs.existsSync(workDir)) {
		fs.mkdirSync(workDir, { recursive: true });
	}
	return workDir;
}

export function getExportDownloadLockKey(exportId) {
	return `export-download:${exportId}`;
}

export function getExportUploadLockKey(exportId) {
	return `export-upload:${exportId}`;
}

export function getExportDeleteLockKey(exportId) {
	return `export-delete:${exportId}`;
}

export function getExportProcessingLockKey(exportId) {
	return `export-processing:${exportId}`;
}

export function hasActiveExportOperation(exportId) {
	return (
		isFileLocked(getExportDownloadLockKey(exportId)) ||
		isFileLocked(getExportUploadLockKey(exportId)) ||
		isFileLocked(getExportProcessingLockKey(exportId))
	);
}

function containsLockedFile(directory) {
	if (!fs.existsSync(directory)) return false;
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (isFileLocked(entryPath)) return true;
		if (entry.isDirectory() && containsLockedFile(entryPath)) return true;
	}
	return false;
}

export function deleteExportWorkDir(exportId) {
	if (!exportId) return true;
	const workDir = path.join(DIRS.exports, exportId);
	if (!fs.existsSync(workDir)) return true;
	if (hasActiveExportOperation(exportId) || containsLockedFile(workDir)) {
		console.log(`Deferring cleanup of active export ${exportId}.`);
		return false;
	}

	try {
		fs.rmSync(workDir, { recursive: true, force: true });
		return true;
	} catch (error) {
		console.error(`Failed to remove export work directory ${workDir}:`, error);
		return false;
	}
}

export function deleteFile(filePath) {
	if (!filePath || !fs.existsSync(filePath)) {
		return;
	}

	try {
		fs.unlinkSync(filePath);
	} catch {}
}

export function deleteTemporaryExportFiles(exportId) {
	if (!exportId || !fs.existsSync(DIRS.exports)) {
		return 0;
	}

	if (!deleteExportWorkDir(exportId)) return 0;

	let deleted = 0;

	for (const filename of fs.readdirSync(DIRS.exports)) {
		if (
			!filename.startsWith(`${exportId}_`) &&
			filename !== `${exportId}.srt`
		) {
			continue;
		}

		const filePath = path.join(DIRS.exports, filename);

		try {
			if (!fs.statSync(filePath).isFile()) {
				continue;
			}

			fs.unlinkSync(filePath);
			deleted += 1;
		} catch (error) {
			console.error(
				`Failed to delete temporary export file ${filePath}:`,
				error,
			);
		}
	}

	return deleted;
}
