import fs from "fs";
import path from "path";

import { supabase } from "../../db/client.js";
import * as videoStore from "../../db/videos.js";
import * as exportStore from "../../db/exports.js";
import {
	checkAndFinalizeVideo,
	runProcessingPipeline,
} from "../video/upload-processing.js";
import { runExportJob } from "../export/export-job.js";
import { deleteExportWorkDir } from "../export/export-files.js";
import { hasExpired } from "./retention.js";
import { DIRS as VIDEO_DIRS } from "../video/paths.js";

function findLocalVideoUpload(id) {
	if (!fs.existsSync(VIDEO_DIRS.uploads)) return null;
	const match = fs.readdirSync(VIDEO_DIRS.uploads).find((name) =>
		name.startsWith(`${id}.`),
	);
	return match ? path.join(VIDEO_DIRS.uploads, match) : null;
}

export async function recoverInterruptedJobs() {
	console.log("Scanning for incomplete or interrupted jobs after startup...");

	// 1. Recover incomplete video jobs
	try {
		const { data: incompleteVideos, error } = await supabase
			.from("videos")
			.select()
			.not("status", "in", '("READY","EXPIRED","DELETING")');

		if (error) {
			console.error("Failed to query incomplete videos during recovery:", error);
		} else {
			for (const row of incompleteVideos || []) {
				const video = await videoStore.getVideo(row.id);
				if (!video || hasExpired(video.expiresAt)) continue;

				if (video.status === "ERROR") continue;

				console.log(
					`Checking interrupted video ${video.id} (status: ${video.status}, storage: ${video.storageStatus})`,
				);

				// Case A: Original is already confirmed in Google Drive
				if (video.driveFileId) {
					if (video.storageStatus !== "STORED") {
						await videoStore.patchVideo(video.id, {
							storageStatus: "STORED",
						});
					}

					const transcriptDone =
						video.transcriptionStatus === "COMPLETED" ||
						Boolean(video.transcriptFileId);
					const thumbnailDone =
						video.thumbnailStatus === "STORED" ||
						Boolean(video.thumbnailFileId);

					if (transcriptDone && thumbnailDone) {
						await checkAndFinalizeVideo(video.id);
					} else {
						const localPath = video.filePath || findLocalVideoUpload(video.id);
						if (localPath && fs.existsSync(localPath)) {
							console.log(`Resuming processing pipeline for video ${video.id}`);
							void runProcessingPipeline(video.id);
						} else {
							await checkAndFinalizeVideo(video.id);
						}
					}
				} else {
					// Case B: Original not yet confirmed in Google Drive
					const localPath = video.filePath || findLocalVideoUpload(video.id);
					if (localPath && fs.existsSync(localPath)) {
						console.log(`Resuming upload & processing pipeline for video ${video.id}`);
						void runProcessingPipeline(video.id);
					} else {
						console.warn(
							`Video ${video.id} local file missing after restart; marking as failed.`,
						);
						await videoStore.patchVideo(video.id, {
							status: "ERROR",
							storageStatus: "FAILED",
							error:
								"Upload was interrupted by server restart and the temporary file is no longer available. Please upload again.",
							expiresAt: Date.now(),
						});
					}
				}
			}
		}
	} catch (videoRecoveryError) {
		console.error("Error during video recovery:", videoRecoveryError);
	}

	// 2. Recover incomplete export jobs
	try {
		const { data: incompleteExports, error: exportError } = await supabase
			.from("exports")
			.select()
			.in("status", ["QUEUED", "PROCESSING"]);

		if (exportError) {
			console.error("Failed to query incomplete exports during recovery:", exportError);
		} else {
			for (const row of incompleteExports || []) {
				if (row.drive_file_id) {
					await exportStore.patchExport(row.id, {
						status: "READY",
						progress: 100,
						error: null,
					});
				} else {
					const parentVideo = await videoStore.getVideo(row.video_id);
					if (
						parentVideo &&
						parentVideo.status === "READY" &&
						!hasExpired(parentVideo.expiresAt)
					) {
						console.log(`Retrying interrupted export ${row.id}`);
						void runExportJob(row.id);
					} else {
						await exportStore.patchExport(row.id, {
							status: "ERROR",
							error:
								"Export was interrupted by server restart and parent video is not ready.",
						});
						deleteExportWorkDir(row.id);
					}
				}
			}
		}
	} catch (exportRecoveryError) {
		console.error("Error during export recovery:", exportRecoveryError);
	}
}
