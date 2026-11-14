import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import test from "node:test";
import { FFMPEG_PATH, FFPROBE_PATH } from "../services/ffmpeg/instance.js";
import { exportClip } from "../services/ffmpeg/export.js";
import { probeStreams, probeMetadata } from "../services/ffmpeg/probe.js";
import { buildFillFilter } from "../services/ffmpeg/filters.js";
import { createExportMetrics, safeExportError } from "../services/export/metrics.js";

const available = [FFMPEG_PATH, FFPROBE_PATH].every((binary) =>
	spawnSync(binary, ["-version"], { windowsHide: true }).status === 0,
);

function run(args) {
	const result = spawnSync(FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
		encoding: "utf8", windowsHide: true, timeout: 60_000,
	});
	assert.equal(result.status, 0, result.stderr);
	return result.stdout;
}

function sourceFile(directory, bframes = 0) {
	const source = path.join(directory, `source-b${bframes}.mp4`);
	run([
		"-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=4",
		"-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=4",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "48", "-keyint_min", "48",
		"-sc_threshold", "0", "-bf", String(bframes), "-c:a", "aac", "-shortest",
		"-movflags", "+faststart", source,
	]);
	return source;
}

async function withDirectory(work) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vidhntr-ffmpeg-test-"));
	try { return await work(directory); }
	finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test("real FFmpeg: compatible aligned trim copies streams; non-keyframe/B-frame trims encode", {
	skip: !available, timeout: 60_000,
}, async () => withDirectory(async (directory) => {
	const source = sourceFile(directory);
	const streams = await probeStreams(source);
	for (const [name, start, end, expectedCopy] of [["aligned", 2, 4, true],
		["unaligned", 1, 3, false], ["fractional-end", 2, 3.99, false]]) {
		let decision;
		const output = path.join(directory, `${name}.mp4`);
		await exportClip({ sourcePath: source, outputPath: output, start, end,
			cropMode: "original", width: 320, height: 240, sourceStreams: streams,
			onDecision: (value) => { decision = value; } });
		assert.equal(decision.copyVideo, expectedCopy, JSON.stringify(decision));
		const metadata = await probeMetadata(output);
		assert.ok(Math.abs(metadata.duration - (end - start)) < 0.06);
		assert.equal(metadata.width, 320);
		assert.equal(metadata.height, 240);
		assert.equal(metadata.videoCodec, "h264");
		assert.equal(metadata.audioCodec, "aac");
		// Decode completely and verify the copied first frame is the requested frame.
		run(["-i", output, "-f", "null", "-"]);
		if (expectedCopy) {
			const frame = ["-frames:v", "1", "-an", "-f", "md5", "-"];
			assert.equal(run(["-i", output, ...frame]), run(["-ss", String(start), "-i", source, ...frame]));
		}
		if (name === "fractional-end") assert.equal(decision.reason, "end_not_frame_aligned_reencode");
	}
	const bframeSource = sourceFile(directory, 2);
	let bframeDecision;
	await exportClip({ sourcePath: bframeSource, outputPath: path.join(directory, "bframes.mp4"),
		start: 2, end: 4, cropMode: "original", width: 320, height: 240,
		sourceStreams: await probeStreams(bframeSource),
		onDecision: (value) => { bframeDecision = value; } });
	assert.equal(bframeDecision.copyVideo, false);
	assert.equal(bframeDecision.reason, "reordered_frames_require_reencode");
	const pcmSource = path.join(directory, "pcm-source.mkv");
	run(["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=4",
		"-f", "lavfi", "-i", "sine=sample_rate=48000:duration=4",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "48", "-sc_threshold", "0",
		"-bf", "0", "-c:a", "pcm_s16le", "-shortest", pcmSource]);
	let pcmDecision;
	const pcmOutput = path.join(directory, "pcm-converted.mp4");
	await exportClip({ sourcePath: pcmSource, outputPath: pcmOutput, start: 2, end: 4,
		cropMode: "original", width: 320, height: 240, sourceStreams: await probeStreams(pcmSource),
		onDecision: (value) => { pcmDecision = value; } });
	assert.equal(pcmDecision.copyVideo, true);
	assert.equal(pcmDecision.copyAudio, false);
	assert.equal((await probeMetadata(pcmOutput)).audioCodec, "aac");
	run(["-i", pcmOutput, "-f", "null", "-"]);
}));

test("real FFmpeg: fill, fit, square and burned captions preserve dimensions and decode", {
	skip: !available, timeout: 60_000,
}, async () => withDirectory(async (directory) => {
	const source = sourceFile(directory);
	const streams = await probeStreams(source);
	const subtitles = path.join(directory, "captions.srt");
	fs.writeFileSync(subtitles, "1\n00:00:00,000 --> 00:00:01,000\nCaption appearance retained\n");
	for (const [name, mode, width, height, captions] of [
		["portrait-fill", "fill", 240, 320, null],
		["portrait-fit", "fit", 240, 320, subtitles],
		["square", "fill", 240, 240, null],
		["landscape", "fit", 320, 180, null],
	]) {
		const output = path.join(directory, `${name}.mp4`);
		const observations = [];
		await exportClip({ sourcePath: source, outputPath: output, start: 0, end: 1,
			cropMode: mode, width, height, sourceStreams: streams, captionsSrtPath: captions,
			onResources: (value) => observations.push(value) });
		const metadata = await probeMetadata(output);
		assert.equal(metadata.width, width);
		assert.equal(metadata.height, height);
		assert.ok(Math.abs(metadata.duration - 1) < 0.06);
		assert.equal(observations.length, 1);
		assert.ok(observations[0].minimumHostFreeMemoryBytes > 0);
		assert.equal(observations[0].concurrentFfmpegJobsAtStart, 1);
		run(["-i", output, "-f", "null", "-"]);
	}
}));

test("real FFmpeg: remote input sends authentication and byte Range requests", {
	skip: !available, timeout: 60_000,
}, async () => withDirectory(async (directory) => {
	const source = sourceFile(directory);
	const bytes = fs.readFileSync(source);
	const requests = [];
	const server = http.createServer((request, response) => {
		requests.push({ authorization: request.headers.authorization, range: request.headers.range });
		if (request.headers.authorization !== "Bearer TEST-ONLY-TOKEN") {
			response.writeHead(401).end(); return;
		}
		const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || "");
		const start = match ? Number(match[1]) : 0;
		const end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
		if (start >= bytes.length) { response.writeHead(416).end(); return; }
		response.writeHead(match ? 206 : 200, {
			"Content-Type": "video/mp4", "Accept-Ranges": "bytes",
			"Content-Length": end - start + 1,
			...(match ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {}),
		});
		response.end(bytes.subarray(start, end + 1));
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const remote = `http://127.0.0.1:${server.address().port}/source.mp4`;
		const inputOptions = ["-headers", "Authorization: Bearer TEST-ONLY-TOKEN\r\n", "-seekable", "1"];
		const streams = await probeStreams(remote, inputOptions);
		const output = path.join(directory, "remote.mp4");
		await exportClip({ sourcePath: remote, outputPath: output, inputOptions,
			start: 1, end: 2, cropMode: "fill", width: 240, height: 320, sourceStreams: streams,
			onProgress: () => {} });
		assert.ok(requests.length >= 2);
		assert.ok(requests.every((request) => request.authorization === "Bearer TEST-ONLY-TOKEN"));
		assert.ok(requests.some((request) => request.range?.startsWith("bytes=")));
		assert.equal((await probeMetadata(output)).width, 240);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}));

test("telemetry accumulates failed stages and redacts authenticated FFmpeg error text", async () => {
	const metrics = createExportMetrics(Date.now() - 50);
	await assert.rejects(metrics.measure("ffmpegMs", () => Promise.reject(new Error("failed"))));
	assert.ok(metrics.timings.ffmpegMs >= 0);
	assert.ok(metrics.timings.queueWaitMs >= 50);
	assert.equal(metrics.snapshot().driveUploadMs, null);
	assert.equal(safeExportError(new Error("-headers Authorization: Bearer SECRET-TOKEN\r\n"))
		.includes("SECRET-TOKEN"), false);
	assert.equal(buildFillFilter(1080, 1920).length, 2);
});
