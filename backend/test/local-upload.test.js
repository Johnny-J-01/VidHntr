import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
	finalizeLocalUpload,
	getTemporaryUploadPath,
	removeLocalFile,
	saveUploadedVideo,
} from "../services/video/local-upload.js";

async function createTestDirectories() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "vidhntr-upload-test-"));
	const incoming = path.join(root, "incoming");
	const uploads = path.join(root, "uploads");
	await fs.mkdir(incoming);
	await fs.mkdir(uploads);
	return { root, incoming, uploads };
}

function mp4Header() {
	const header = Buffer.alloc(16);
	header.writeUInt32BE(16, 0);
	header.write("ftyp", 4, "ascii");
	header.write("isom", 8, "ascii");
	return header;
}

test("finalizeLocalUpload validates and atomically promotes an MP4", async () => {
	const { root, incoming, uploads } = await createTestDirectories();
	const videoId = "a3b5d18d-03b7-49bf-a853-9e4ffd268e8f";
	const temporaryPath = getTemporaryUploadPath(incoming, videoId);

	try {
		await fs.writeFile(temporaryPath, mp4Header());
		const finalPath = await finalizeLocalUpload({
			temporaryPath,
			uploadDirectory: uploads,
			videoId,
			mimeType: "video/mp4",
		});

		assert.equal(finalPath, path.join(uploads, `${videoId}.mp4`));
		await assert.rejects(fs.stat(temporaryPath), { code: "ENOENT" });
		assert.equal((await fs.stat(finalPath)).size, 16);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("finalizeLocalUpload rejects mismatched content without promoting it", async () => {
	const { root, incoming, uploads } = await createTestDirectories();
	const videoId = "58e44481-83b9-49fc-bcbd-89948d7ff35f";
	const temporaryPath = getTemporaryUploadPath(incoming, videoId);

	try {
		await fs.writeFile(temporaryPath, "not a video");
		await assert.rejects(
			finalizeLocalUpload({
				temporaryPath,
				uploadDirectory: uploads,
				videoId,
				mimeType: "video/mp4",
			}),
			/The file contents do not match/,
		);
		await assert.rejects(fs.stat(path.join(uploads, `${videoId}.mp4`)), { code: "ENOENT" });
		await removeLocalFile(temporaryPath);
		await assert.rejects(fs.stat(temporaryPath), { code: "ENOENT" });
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("finalizeLocalUpload rejects an oversized file without promoting it", async () => {
	const { root, incoming, uploads } = await createTestDirectories();
	const videoId = "4adcbce8-a3f8-41e4-8f11-d9a0fe92c110";
	const temporaryPath = getTemporaryUploadPath(incoming, videoId);

	try {
		await fs.writeFile(
			temporaryPath,
			Buffer.concat([mp4Header(), Buffer.alloc(1024 * 1024)]),
		);
		await assert.rejects(
			finalizeLocalUpload({
				temporaryPath,
				uploadDirectory: uploads,
				videoId,
				mimeType: "video/mp4",
				maximumSizeBytes: 1024 * 1024,
			}),
			/exceeds the 1 MB limit/,
		);
		await assert.rejects(fs.stat(path.join(uploads, `${videoId}.mp4`)), { code: "ENOENT" });
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("concurrent uploads use separate temporary and final paths", async () => {
	const { root, incoming, uploads } = await createTestDirectories();
	const videoIds = [
		"d65bfda3-6be8-4767-82cd-f5cfd5af556f",
		"14e72444-6c32-460c-b1bf-dcf0d5052e5d",
	];

	try {
		const finalPaths = await Promise.all(videoIds.map(async (videoId) => {
			const temporaryPath = getTemporaryUploadPath(incoming, videoId);
			await fs.writeFile(temporaryPath, mp4Header());
			return finalizeLocalUpload({
				temporaryPath,
				uploadDirectory: uploads,
				videoId,
				mimeType: "video/mp4",
			});
		}));

		assert.deepEqual(finalPaths.sort(), videoIds.map((id) => path.join(uploads, `${id}.mp4`)).sort());
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("database failure removes the promoted file and releases the reservation", async () => {
	const { root, incoming, uploads } = await createTestDirectories();
	const videoId = "5098c080-fbfb-4293-b30a-8c78f70c1668";
	const temporaryPath = getTemporaryUploadPath(incoming, videoId);

	try {
		await fs.writeFile(temporaryPath, mp4Header());
		const filePath = await finalizeLocalUpload({
			temporaryPath,
			uploadDirectory: uploads,
			videoId,
			mimeType: "video/mp4",
		});
		let releasedId = null;

		await assert.rejects(
			saveUploadedVideo({
				video: { id: videoId, filePath },
				saveVideo: async () => {
					throw new Error("database unavailable");
				},
				releaseReservation: async (id) => {
					releasedId = id;
				},
			}),
			/database unavailable/,
		);

		assert.equal(releasedId, videoId);
		await assert.rejects(fs.stat(filePath), { code: "ENOENT" });
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("cleanup removes an interrupted temporary upload", async () => {
	const { root, incoming } = await createTestDirectories();
	const temporaryPath = getTemporaryUploadPath(incoming, "15b343a7-152c-494e-8735-6b637e91526e");

	try {
		await fs.writeFile(temporaryPath, Buffer.from("partial upload"));
		await removeLocalFile(temporaryPath);
		await assert.rejects(fs.stat(temporaryPath), { code: "ENOENT" });
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
