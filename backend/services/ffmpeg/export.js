import ffmpeg from "./instance.js";
import fs from "fs";
import path from "path";
import { buildCaptionFilter, buildFillFilter } from "./filters.js";
import { probeDuration } from "./probe.js";
import { getStreamCopyPlan } from "./stream-copy.js";
import { createResourceMonitor } from "./resources.js";

let activeFfmpegJobs = 0;

export async function normalizeVideoSection(inputPath, outputPath, duration, onResources) {
	if (!fs.existsSync(inputPath)) {
		throw new Error("Cannot normalize video section because the source file does not exist.");
	}
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	const command = ffmpeg(inputPath)
		.videoFilters("setpts=PTS-STARTPTS")
		.audioFilters("asetpts=PTS-STARTPTS")
		.setDuration(Math.max(0.1, Number(duration) || 0))
		.videoCodec("libx264")
		.audioCodec("aac")
		.outputOptions([
			"-threads 1", // Keep the separate YouTube normalization policy unchanged.
			"-map 0:v:0", "-map 0:a:0?", "-pix_fmt yuv420p",
			"-preset ultrafast", "-crf 22", "-c:a aac", "-b:a 128k",
			"-ar 48000", "-ac 2", "-start_at_zero",
			"-avoid_negative_ts make_zero", "-movflags +faststart",
			"-max_muxing_queue_size 1024",
		])
		.output(outputPath);
	return runCommand(command, outputPath, null, onResources);
}

export const QUALITY_PRESETS = {
	low: { crf: 28, preset: "ultrafast", audioBitrate: "128k" },
	medium: { crf: 25, preset: "ultrafast", audioBitrate: "128k" },
	high: { crf: 22, preset: "superfast", audioBitrate: "160k" },
	maximum: { crf: 20, preset: "superfast", audioBitrate: "192k" },
};

function runCommand(command, outputPath, onProgress, onResources, sourceStreams) {
	// fluent-ffmpeg automatically probes for progress, without input headers.
	// Reuse the already authenticated source probe rather than issue that request.
	if (sourceStreams) {
		command.ffprobe = (...args) => {
			const callback = args[args.length - 1];
			queueMicrotask(() => callback(null, {
				format: { duration: sourceStreams.metadata?.duration },
				streams: [...sourceStreams.videoStreams, ...sourceStreams.audioStreams],
			}));
		};
	}
	const monitor = createResourceMonitor();
	let started = false;
	let finished = false;
	let concurrencyAtStart = 0;
	return new Promise((resolve, reject) => {
		async function finish(error) {
			if (finished) return;
			finished = true;
			if (started) activeFfmpegJobs -= 1;
			try {
				const resources = await monitor.stop();
				await onResources?.({ ...resources, concurrentFfmpegJobsAtStart: concurrencyAtStart });
				if (error) reject(error);
				else resolve(outputPath);
			} catch (monitorError) {
				reject(error || monitorError);
			}
		}
		command
			.on("start", () => {
				started = true;
				activeFfmpegJobs += 1;
				concurrencyAtStart = activeFfmpegJobs;
				monitor.attach(command.ffmpegProc);
				monitor.start();
			})
			.on("end", () => { void finish(); })
			.on("error", (error) => { void finish(error); });
		if (onProgress) command.on("progress", (progress) => {
			Promise.resolve().then(() => onProgress(Math.min(100, progress.percent || 0)))
				.catch(() => {});
		});
		command.run();
	});
}

function encodedAudioOptions(quality) {
	return [
		"-c:a aac",
		`-b:a ${quality.audioBitrate}`,
		"-ar 48000",
		"-ac 2",
		"-af asetpts=PTS-STARTPTS",
	];
}

function commonOutputOptions() {
	return [
		"-movflags +faststart",
		"-avoid_negative_ts make_zero",
		"-max_muxing_queue_size 1024",
	];
}

export async function exportClip(options) {
	const {
		sourcePath,
		outputPath,
		start,
		end,
		width,
		height,
		quality = "high",
		cropMode = "fill",
		captionsSrtPath = null,
		inputOptions = [],
		sourceStreams = null,
		disableStreamCopy = false,
		onProgress,
		onDecision,
		onResources,
		measureProbe = (work) => work(),
	} = options;
	const duration = Math.max(0.1, Number(end) - Number(start));
	const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.high;

	let copyPlan = disableStreamCopy
		? { copyVideo: false, copyAudio: false, reason: "stream_copy_disabled" }
		: await measureProbe(() => getStreamCopyPlan({
			sourcePath,
			inputOptions,
			start,
			end,
			cropMode,
			captionsSrtPath,
			streams: sourceStreams,
		}));
	onDecision?.(copyPlan);

	if (copyPlan.copyVideo) {
		const outputOptions = [
			"-map 0:v:0",
			"-map 0:a:0?",
			"-c:v copy",
			...(copyPlan.copyAudio ? ["-c:a copy"] : encodedAudioOptions(q)),
			...commonOutputOptions(),
		];
		const command = ffmpeg(sourcePath)
			.inputOptions(inputOptions)
			.setStartTime(start)
			.setDuration(duration)
			.outputOptions(outputOptions)
			.output(outputPath);

		try {
			await runCommand(command, outputPath, onProgress, onResources, sourceStreams);
			const actualDuration = await measureProbe(() => probeDuration(outputPath));
			const fps = Number(sourceStreams?.videoStreams?.[0]?.r_frame_rate?.split("/")[0]) /
				Number(sourceStreams?.videoStreams?.[0]?.r_frame_rate?.split("/")[1]);
			const tolerance = Number.isFinite(fps) && fps > 0
				? Math.max(0.05, 1 / fps + 0.005)
				: 0.05;
			if (Math.abs(actualDuration - duration) > tolerance) {
				throw new Error("Stream-copy output duration exceeded the allowed frame-boundary tolerance.");
			}
			return outputPath;
		} catch {
			fs.rmSync(outputPath, { force: true });
			copyPlan = {
				copyVideo: false,
				copyAudio: false,
				reason: "stream_copy_failed_or_inaccurate_fallback_reencode",
			};
			onDecision?.(copyPlan);
		}
	}

	const captionFilter = buildCaptionFilter(captionsSrtPath, width, height);
	let command;

	if (cropMode === "fit") {
		const [backgroundCrop, backgroundScale] = buildFillFilter(width, height, 0.5);
		const filters = [
			"[0:v]setpts=PTS-STARTPTS[vpts]",
			"[vpts]split=2[bg][fg]",
			`[bg]${backgroundCrop},${backgroundScale},boxblur=luma_radius=10:luma_power=1[bgblur]`,
			`[fg]scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:flags=bilinear[fgfit]`,
			"[bgblur][fgfit]overlay=(W-w)/2:(H-h)/2[composed]",
			captionFilter ? `[composed]${captionFilter}[vout]` : "[composed]null[vout]",
		];
		command = ffmpeg(sourcePath)
			.complexFilter(filters)
			.outputOptions(["-map [vout]"]);
	} else if (cropMode === "fill" || cropMode === "original") {
		const filters = ["setpts=PTS-STARTPTS"];
		if (cropMode === "fill") filters.push(...buildFillFilter(width, height));
		if (captionFilter) filters.push(captionFilter);
		command = ffmpeg(sourcePath)
			.videoFilters(filters)
			.outputOptions(["-map 0:v:0"]);
	} else {
		throw new Error(`Unsupported crop mode: ${cropMode}`);
	}

	command
		.inputOptions([...inputOptions, "-accurate_seek"])
		.setStartTime(start)
		.setDuration(duration)
		.outputOptions([
			"-map 0:a:0?",
			"-vcodec libx264",
			`-crf ${q.crf}`,
			`-preset ${q.preset}`,
			"-pix_fmt yuv420p",
			...encodedAudioOptions(q),
			"-start_at_zero",
			...commonOutputOptions(),
		])
		.output(outputPath);

	return runCommand(command, outputPath, onProgress, onResources, sourceStreams);
}
