import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Windows local fallback paths
const localFfmpeg = path.resolve(__dirname, "..", "..", "..", "ffmpeg-9.0.1-essentials_build", "bin", "ffmpeg.exe");
const localFfprobe = path.resolve(__dirname, "..", "..", "..", "ffmpeg-9.0.1-essentials_build", "bin", "ffprobe.exe");

// Automatically use local Windows binaries if present, otherwise default to system Linux binaries
const FFMPEG_PATH = process.env.FFMPEG_PATH || (fs.existsSync(localFfmpeg) ? localFfmpeg : "ffmpeg");
const FFPROBE_PATH = process.env.FFPROBE_PATH || (fs.existsSync(localFfprobe) ? localFfprobe : "ffprobe");

ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);
function probeDuration(filePath) {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (error, data) => {
			if (error) {
				return reject(error);
			}

			resolve(Number(data.format?.duration) || 0);
		});
	});
}

function probeStreams(filePath) {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (error, data) => {
			if (error) {
				return reject(error);
			}

			const videoStreams = (data.streams || []).filter(
				(stream) => stream.codec_type === "video",
			);

			const audioStreams = (data.streams || []).filter(
				(stream) => stream.codec_type === "audio",
			);

			resolve({
				hasVideo: videoStreams.length > 0,
				hasAudio: audioStreams.length > 0,
				videoStreams,
				audioStreams,
			});
		});
	});
}

function probeTiming(filePath) {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (error, data) => {
			if (error) {
				return reject(error);
			}

			const format = data.format || {};

			const streams = (data.streams || []).map((stream) => ({
				index: stream.index,
				codecType: stream.codec_type,
				codecName: stream.codec_name,
				startTime: stream.start_time,
				duration: stream.duration,
				timeBase: stream.time_base,
				avgFrameRate: stream.avg_frame_rate,
				rFrameRate: stream.r_frame_rate,
			}));

			resolve({
				formatStartTime: format.start_time,
				formatDuration: format.duration,
				streams,
			});
		});
	});
}

function extractAudio(videoPath, audioOutPath) {
	return new Promise((resolve, reject) => {
		ffmpeg(videoPath)
			.noVideo()
			.audioCodec("libmp3lame")
			.audioChannels(1)
			.audioFrequency(16000)
			.output(audioOutPath)
			.on("end", () => resolve(audioOutPath))
			.on("error", (error) => reject(error))
			.run();
	});
}

function generateThumbnail(videoPath, outDir, id, atSeconds = 3) {
	return new Promise((resolve, reject) => {
		const filename = `${id}.jpg`;

		fs.mkdirSync(outDir, {
			recursive: true,
		});

		ffmpeg(videoPath)
			.on("end", () => resolve(path.join(outDir, filename)))
			.on("error", (error) => reject(error))
			.screenshots({
				timestamps: [atSeconds],
				filename,
				folder: outDir,
				size: "480x?",
			});
	});
}

function srtTimestamp(totalSeconds) {
	const totalMilliseconds = Math.max(
		0,
		Math.round(Number(totalSeconds) * 1000),
	);

	const h = Math.floor(totalMilliseconds / 3600000);
	const m = Math.floor((totalMilliseconds % 3600000) / 60000);
	const s = Math.floor((totalMilliseconds % 60000) / 1000);
	const ms = totalMilliseconds % 1000;

	const pad = (value, length = 2) => String(value).padStart(length, "0");

	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function buildSrtForRange(transcript, clipStart, clipEnd, outPath) {
	const startLimit = Number(clipStart);
	const endLimit = Number(clipEnd);

	if (
		!Array.isArray(transcript) ||
		!Number.isFinite(startLimit) ||
		!Number.isFinite(endLimit) ||
		endLimit <= startLimit
	) {
		fs.writeFileSync(outPath, "", "utf-8");
		return outPath;
	}

	const clipDuration = endLimit - startLimit;

	// 1. Filter valid segments within clip range
	const rawSegments = transcript
		.filter((segment) => {
			const s = Number(segment?.start);
			const e = Number(segment?.end);
			const t = String(segment?.text || "").trim();
			return (
				t &&
				Number.isFinite(s) &&
				Number.isFinite(e) &&
				e > startLimit &&
				s < endLimit
			);
		})
		.map((segment) => ({
			start: Number(segment.start),
			end: Number(segment.end),
			text: String(segment.text).trim(),
		}))
		.sort((a, b) => a.start - b.start);

	// 2. Clean duplicates before calculating overlaps
	const validSegments = [];
	for (let i = 0; i < rawSegments.length; i += 1) {
		const current = rawSegments[i];
		const prev = validSegments[validSegments.length - 1];
		if (
			prev &&
			prev.text.toLowerCase() === current.text.toLowerCase() &&
			Math.abs(current.start - prev.start) < 2.0
		) {
			continue;
		}
		validSegments.push(current);
	}

	// 3. Build SRT entries
	const lines = [];
	for (let i = 0; i < validSegments.length; i += 1) {
		const segment = validSegments[i];

		let relStart = Math.max(0, segment.start - startLimit);
		let relEnd = Math.min(clipDuration, segment.end - startLimit);

		if (i < validSegments.length - 1) {
			const nextRelStart = Math.max(
				0,
				validSegments[i + 1].start - startLimit,
			);
			if (relEnd > nextRelStart) {
				relEnd = nextRelStart;
			}
		}

		if (relEnd <= relStart) {
			relEnd = Math.min(clipDuration, relStart + 0.5);
		}

		relStart = Number(relStart.toFixed(3));
		relEnd = Number(relEnd.toFixed(3));

		lines.push(String(i + 1));
		lines.push(`${srtTimestamp(relStart)} --> ${srtTimestamp(relEnd)}`);
		lines.push(segment.text);
		lines.push("");
	}

	fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
	return outPath;
}

function normalizeVideoSection(inputPath, outputPath, duration) {
	return new Promise((resolve, reject) => {
		const safeDuration = Math.max(0.1, Number(duration) || 0);

		if (!fs.existsSync(inputPath)) {
			reject(
				new Error(
					"Cannot normalize video section because the source file does not exist.",
				),
			);
			return;
		}

		fs.mkdirSync(path.dirname(outputPath), {
			recursive: true,
		});

		ffmpeg(inputPath)
			.videoFilters("setpts=PTS-STARTPTS")
			.audioFilters("asetpts=PTS-STARTPTS")
			.setDuration(safeDuration)
			.videoCodec("libx264")
			.audioCodec("aac")
			.outputOptions([
				"-map 0:v:0",
				"-map 0:a:0?",
				"-pix_fmt yuv420p",
				"-preset veryfast",
				"-crf 18",
				"-c:a aac",
				"-b:a 192k",
				"-ar 48000",
				"-ac 2",
				"-start_at_zero",
				"-avoid_negative_ts make_zero",
				"-movflags +faststart",
			])
			.output(outputPath)
			.on("end", () => resolve(outputPath))
			.on("error", (error) => reject(error))
			.run();
	});
}

const QUALITY_PRESETS = {
	low: { crf: 28, preset: "ultrafast", audioBitrate: "128k" },
	medium: { crf: 24, preset: "superfast", audioBitrate: "128k" },
	high: { crf: 20, preset: "veryfast", audioBitrate: "192k" },
	maximum: { crf: 18, preset: "fast", audioBitrate: "256k" },
};

function buildFillFilter(width, height) {
	const targetAspect = width / height;
	const cropWidth = `if(gt(iw/ih\\,${targetAspect})\\,ih*${targetAspect}\\,iw)`;
	const cropHeight = `if(gt(iw/ih\\,${targetAspect})\\,ih\\,iw/${targetAspect})`;
	const cropX = `(iw-${cropWidth})/2`;
	const cropY = `(ih-${cropHeight})*0.42`;

	return [
		`crop=w=${cropWidth}:h=${cropHeight}:x=${cropX}:y=${cropY}`,
		`scale=w=${width}:h=${height}:flags=bicubic`,
	];
}

function escapeFilterPath(filePath) {
	return filePath
		.replace(/\\/g, "/")
		.replace(/:/g, "\\:")
		.replace(/'/g, "\\'");
}

function buildCaptionFilter(captionsSrtPath, width, height) {
	if (!captionsSrtPath || !fs.existsSync(captionsSrtPath)) {
		return null;
	}

	try {
		const stats = fs.statSync(captionsSrtPath);
		if (stats.size === 0) {
			return null;
		}
	} catch {
		return null;
	}

	const escaped = escapeFilterPath(captionsSrtPath);
	const isVertical = height && width ? height > width : false;

	// Modern Social Media Caption Style:
	// - BorderStyle=1: Clean text with black outline & deep drop shadow (No ugly blocky rectangle)
	// - PrimaryColour=&H0015CCFA: Vibrant Yellow (#FACC15)
	// - OutlineColour=&H00000000: Solid Black stroke for high contrast
	// - FontName=Trebuchet MS / Arial Black: Punchy, readable font weight
	const forceStyle = isVertical
		? "FontName=Trebuchet MS,FontSize=14,Bold=1,PrimaryColour=&H0015CCFA,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=3,Shadow=3,Alignment=2,MarginV=55"
		: "FontName=Trebuchet MS,FontSize=14,Bold=1,PrimaryColour=&H0015CCFA,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=2.5,Shadow=2.5,Alignment=2,MarginV=30";

	return `subtitles='${escaped}':force_style='${forceStyle}'`;
}

function exportClip({
	sourcePath,
	outputPath,
	start,
	end,
	width,
	height,
	quality = "high",
	cropMode = "fill",
	captionsSrtPath = null,
	onProgress,
}) {
	return new Promise((resolve, reject) => {
		try {
			console.time("⏱️ Export Speed");
			const duration = Math.max(0.1, Number(end) - Number(start));
			const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.high;

			if (cropMode === "fill") {
				const filters = [
					"setpts=PTS-STARTPTS",
					...buildFillFilter(width, height),
				];

				const captionFilter = buildCaptionFilter(
					captionsSrtPath,
					width,
					height,
				);
				if (captionFilter) {
					filters.push(captionFilter);
				}

				const command = ffmpeg(sourcePath)
					.inputOptions(["-accurate_seek"])
					.setStartTime(start)
					.setDuration(duration)
					.videoFilters(filters)
					.videoCodec("libx264")
					.outputOptions([
						"-map 0:v:0",
						"-map 0:a:0?",
						`-crf ${q.crf}`,
						`-preset ${q.preset}`,
						"-pix_fmt yuv420p",
						"-c:a aac",
						`-b:a ${q.audioBitrate}`,
						"-ar 48000",
						"-ac 2",
						"-af asetpts=PTS-STARTPTS",
						"-start_at_zero",
						"-movflags +faststart",
						"-avoid_negative_ts make_zero",
					])
					.output(outputPath);

				command
					.on("progress", (progress) => {
						if (onProgress) {

							onProgress(Math.min(100, progress.percent || 0));
						}
					})
					.on("end", () => {
						console.timeEnd("⏱️ Export Speed");
						resolve(outputPath);
					})
					.on("error", (error) => reject(error))
					.run();

				return;
			}

			if (cropMode === "fit") {
				const filters = [
					"[0:v]setpts=PTS-STARTPTS[vpts]",
					"[vpts]split=2[bg][fg]",
					`[bg]scale=w=${width}:h=${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},boxblur=luma_radius=20:luma_power=2[bgblur]`,
					`[fg]scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:flags=lanczos[fgfit]`,
					"[bgblur][fgfit]overlay=(W-w)/2:(H-h)/2[composed]",
				];

				const captionFilter = buildCaptionFilter(
					captionsSrtPath,
					width,
					height,
				);
				if (captionFilter) {
					filters.push(`[composed]${captionFilter}[vout]`);
				} else {
					filters.push("[composed]null[vout]");
				}

				const command = ffmpeg(sourcePath)
					.inputOptions(["-accurate_seek"])
					.setStartTime(start)
					.setDuration(duration)
					.complexFilter(filters)
					.outputOptions([
						"-map [vout]",
						"-map 0:a:0?",
						"-vcodec libx264",
						`-crf ${q.crf}`,
						`-preset ${q.preset}`,
						"-pix_fmt yuv420p",
						"-c:a aac",
						`-b:a ${q.audioBitrate}`,
						"-ar 48000",
						"-ac 2",
						"-af asetpts=PTS-STARTPTS",
						"-start_at_zero",
						"-movflags +faststart",
						"-avoid_negative_ts make_zero",
					])
					.output(outputPath);

				command
					.on("progress", (progress) => {
						if (onProgress) {
							onProgress(Math.min(100, progress.percent || 0));
						}
					})
					.on("end", () => {
						console.timeEnd("⏱️ Export Speed");
						resolve(outputPath);
					})
					.on("error", (error) => reject(error))
					.run();

				return;
			}

			reject(new Error(`Unsupported crop mode: ${cropMode}`));
		} catch (error) {
			reject(error);
		}
	});
}

export {
	probeDuration,
	probeStreams,
	probeTiming,
	extractAudio,
	generateThumbnail,
	srtTimestamp,
	buildSrtForRange,
	normalizeVideoSection,
	exportClip,
	QUALITY_PRESETS,
	buildFillFilter,
	escapeFilterPath,
	buildCaptionFilter,
};

export default {
	probeDuration,
	probeStreams,
	probeTiming,
	extractAudio,
	generateThumbnail,
	buildSrtForRange,
	normalizeVideoSection,
	exportClip,
	QUALITY_PRESETS,
};