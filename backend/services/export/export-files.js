import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

export function deleteExportWorkDir(exportId) {
	if (!exportId) return;
	const workDir = path.join(DIRS.exports, exportId);
	if (fs.existsSync(workDir)) {
		try {
			fs.rmSync(workDir, { recursive: true, force: true });
		} catch (error) {
			console.error(`Failed to remove export work directory ${workDir}:`, error);
		}
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

	deleteExportWorkDir(exportId);

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
