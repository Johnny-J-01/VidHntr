import fs from "fs";

const activeLocks = new Map();

export function acquireFileLock(filePath) {
	if (!filePath) return;
	const count = activeLocks.get(filePath) || 0;
	activeLocks.set(filePath, count + 1);
}

export function releaseFileLock(filePath) {
	if (!filePath) return;
	const count = activeLocks.get(filePath) || 0;
	if (count <= 1) {
		activeLocks.delete(filePath);
	} else {
		activeLocks.set(filePath, count - 1);
	}
}

export function isFileLocked(filePath) {
	if (!filePath) return false;
	return (activeLocks.get(filePath) || 0) > 0;
}

export async function safeDeleteLocalOriginal(filePath) {
	if (!filePath || isFileLocked(filePath)) {
		return false;
	}

	if (fs.existsSync(filePath)) {
		try {
			await fs.promises.unlink(filePath);
			return true;
		} catch (error) {
			if (error.code !== "ENOENT") {
				console.error(`Failed to delete local original ${filePath}:`, error);
			}
			return false;
		}
	}

	return true;
}
