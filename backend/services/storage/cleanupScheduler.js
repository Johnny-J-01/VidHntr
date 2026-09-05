import { cleanupExpiredData } from "./cleanup.js";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export function startCleanupScheduler() {
    cleanupExpiredData();

    setInterval(() => {
        cleanupExpiredData();
    }, CLEANUP_INTERVAL_MS);

    console.log("Storage cleanup scheduler started");
}