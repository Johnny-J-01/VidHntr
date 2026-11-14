import { cleanupExpiredData } from "./cleanup.js";

const CLEANUP_INTERVAL_MS = 60 * 1000;
let cleanupRunning = false;

async function runCleanup() {
	if (cleanupRunning) return;

	cleanupRunning = true;
	try {
		await cleanupExpiredData();
	} catch (error) {
		console.error("Scheduled storage cleanup failed:", error);
	} finally {
		cleanupRunning = false;
	}
}

export function startCleanupScheduler() {
	void runCleanup();

	setInterval(() => {
		void runCleanup();
	}, CLEANUP_INTERVAL_MS);

	console.log("Storage cleanup scheduler started");
}
