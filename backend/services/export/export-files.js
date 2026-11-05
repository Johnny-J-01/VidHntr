import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, "..", "..", "storage");

const DIRS = {
	uploads: path.join(STORAGE, "uploads"),
	exports: path.join(STORAGE, "exports"),
};

Object.values(DIRS).forEach((directory) => {
	fs.mkdirSync(directory, {
		recursive: true,
	});
});

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
