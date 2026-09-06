import { cleanupExpiredData } from "./cleanup.js";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

async function runCleanup() {
	try {
		await cleanupExpiredData();
	} catch (error) {
		console.error("Scheduled storage cleanup failed:", error);
	}
}

export function startCleanupScheduler() {
	runCleanup();

	setInterval(() => {
		runCleanup();
	}, CLEANUP_INTERVAL_MS);

	console.log("Storage cleanup scheduler started");
}
