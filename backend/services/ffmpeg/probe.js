import ffmpeg from "./instance.js";

export function probeDuration(filePath) {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (error, data) => {
			if (error) {
				return reject(error);
			}

			resolve(Number(data.format?.duration) || 0);
		});
	});
}

export function probeMetadata(filePath) {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (error, data) => {
			if (error) {
				return reject(error);
			}

			const format = data.format || {};
			const videoStream = (data.streams || []).find((s) => s.codec_type === "video");
			const audioStream = (data.streams || []).find((s) => s.codec_type === "audio");

			let frameRate = null;
			if (videoStream?.avg_frame_rate && videoStream.avg_frame_rate !== "0/0") {
				const [num, den] = videoStream.avg_frame_rate.split("/").map(Number);
				if (den && den > 0) {
					frameRate = Math.round((num / den) * 100) / 100;
				}
			}

			resolve({
				duration: Number(format.duration) || 0,
				width: videoStream ? Number(videoStream.width) || null : null,
				height: videoStream ? Number(videoStream.height) || null : null,
				frameRate,
				videoCodec: videoStream?.codec_name || null,
				audioCodec: audioStream?.codec_name || null,
				bitRate: Number(format.bit_rate) || null,
				formatName: format.format_name || null,
			});
		});
	});
}

export function probeStreams(filePath, inputOptions = []) {
	return new Promise((resolve, reject) => {
		// fluent-ffmpeg's ffprobe does not inherit command inputOptions.
		// Supply raw probe arguments explicitly, including authenticated headers.
		ffmpeg(filePath).ffprobe(Array.isArray(inputOptions) ? inputOptions : [], (error, data) => {
			if (error) {
				return reject(error);
			}

			const videoStreams = (data.streams || []).filter(
				(stream) => stream.codec_type === "video",
			);

			const audioStreams = (data.streams || []).filter(
				(stream) => stream.codec_type === "audio",
			);

			const video = videoStreams[0];
			const [numerator, denominator] = String(video?.avg_frame_rate || "0/0")
				.split("/").map(Number);
			resolve({
				hasVideo: videoStreams.length > 0,
				hasAudio: audioStreams.length > 0,
				videoStreams,
				audioStreams,
				metadata: {
					duration: Number(data.format?.duration) || Number(video?.duration) || null,
					width: Number(video?.width) || null,
					height: Number(video?.height) || null,
					frameRate: numerator > 0 && denominator > 0 ? numerator / denominator : null,
					videoCodec: video?.codec_name || null,
					audioCodec: audioStreams[0]?.codec_name || null,
					startTime: Number(data.format?.start_time) || 0,
				},
			});
		});
	});
}

export function probeTiming(filePath) {
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
