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

export function probeStreams(filePath) {
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
