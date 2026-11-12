import ffmpeg from "./instance.js";
import fs from "fs";
import path from "path";
import { buildCaptionFilter, buildFillFilter } from "./filters.js";

export function normalizeVideoSection(inputPath, outputPath, duration) {
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
				"-threads 1",
				"-map 0:v:0",
				"-map 0:a:0?",
				"-pix_fmt yuv420p",
				"-preset ultrafast",
				"-crf 22",
				"-c:a aac",
				"-b:a 128k",
				"-ar 48000",
				"-ac 2",
				"-start_at_zero",
				"-avoid_negative_ts make_zero",
				"-movflags +faststart",
				"-max_muxing_queue_size 1024",
			])
			.output(outputPath)
			.on("end", () => resolve(outputPath))
			.on("error", (error) => reject(error))
			.run();
	});
}

export const QUALITY_PRESETS = {
	low: { crf: 28, preset: "ultrafast", audioBitrate: "128k" },
	medium: { crf: 25, preset: "ultrafast", audioBitrate: "128k" },
	high: { crf: 22, preset: "superfast", audioBitrate: "160k" },
	maximum: { crf: 20, preset: "superfast", audioBitrate: "192k" },
};

export function exportClip({
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
					.inputOptions([...inputOptions, "-accurate_seek"])
					.setStartTime(start)
					.setDuration(duration)
					.videoFilters(filters)
					.videoCodec("libx264")
					.outputOptions([
						"-threads 1",
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
						"-max_muxing_queue_size 1024",
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
					`[bg]scale=w=${width}:h=${height}:force_original_aspect_ratio=increase:flags=bilinear,crop=${width}:${height},boxblur=luma_radius=10:luma_power=1[bgblur]`,
					`[fg]scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:flags=bilinear[fgfit]`,
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
					.inputOptions([...inputOptions, "-accurate_seek"])
					.setStartTime(start)
					.setDuration(duration)
					.complexFilter(filters)
					.outputOptions([
						"-threads 1",
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
						"-max_muxing_queue_size 1024",
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
