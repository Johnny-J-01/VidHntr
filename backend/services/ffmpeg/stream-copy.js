import { spawn } from "node:child_process";
import { FFPROBE_PATH } from "./instance.js";

function frameRate(videoStream) {
	for (const value of [videoStream?.avg_frame_rate, videoStream?.r_frame_rate]) {
		const [numerator, denominator] = String(value || "").split("/").map(Number);
		if (numerator > 0 && denominator > 0) return numerator / denominator;
	}
	return null;
}

function probeJson(sourcePath, inputOptions, start, videoStream) {
	const fps = frameRate(videoStream);
	const intervalStart = Math.max(0, Number(start) - 30);
	const intervalEnd = Number(start) + 1 / fps;
	const args = [
		"-v", "error",
		...inputOptions,
		"-read_intervals", `${intervalStart}%${intervalEnd}`,
		"-select_streams", "v:0",
		"-show_packets",
		"-show_entries", "packet=pts_time,dts_time,flags",
		"-of", "json",
		sourcePath,
	];

	return new Promise((resolve, reject) => {
		const child = spawn(FFPROBE_PATH, args, { windowsHide: true });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`FFprobe keyframe inspection failed: ${stderr}`));
				return;
			}
			try {
				resolve(JSON.parse(stdout));
			} catch (error) {
				reject(error);
			}
		});
	});
}

export function selectStreamCopyPlan({
	cropMode,
	captionsSrtPath,
	streams,
	keyframeAligned,
}) {
	const video = streams?.videoStreams?.[0];
	const audio = streams?.audioStreams?.[0];
	const reject = (reason) => ({
		copyVideo: false,
		copyAudio: false,
		reason,
	});

	if (cropMode !== "original") return reject("visual_transformation_required");
	if (captionsSrtPath) return reject("burned_captions_required");
	if (!video) return reject("video_stream_missing");
	if (video.codec_name !== "h264") return reject("video_codec_requires_reencode");
	if (video.pix_fmt !== "yuv420p") {
		return reject("pixel_format_requires_reencode");
	}
	if (video.has_b_frames == null) return reject("frame_reordering_unknown_requires_reencode");
	if (Number(video.has_b_frames) !== 0) return reject("reordered_frames_require_reencode");
	if (audio && Number(audio.start_time || 0) !== 0) return reject("audio_timeline_offset_requires_reencode");
	const average = frameRate({ avg_frame_rate: video.avg_frame_rate });
	const nominal = frameRate({ r_frame_rate: video.r_frame_rate });
	if (!(average > 0) || !(nominal > 0) || Math.abs(average - nominal) > 0.001) {
		return reject("variable_or_unknown_frame_rate_requires_reencode");
	}
	if (Number(video.start_time || 0) !== 0 || Number(streams.metadata?.startTime || 0) !== 0) {
		return reject("nonzero_source_timeline_requires_reencode");
	}
	if (!keyframeAligned) return reject("start_not_keyframe_aligned");

	return {
		copyVideo: true,
		copyAudio: !audio || audio.codec_name === "aac",
		reason: !audio || audio.codec_name === "aac"
			? "keyframe_aligned_compatible_streams"
			: "keyframe_aligned_video_audio_requires_reencode",
	};
}

export async function getStreamCopyPlan({
	sourcePath,
	inputOptions = [],
	start,
	end,
	cropMode,
	captionsSrtPath,
	streams,
}) {
	const compatible = selectStreamCopyPlan({
		cropMode,
		captionsSrtPath,
		streams,
		keyframeAligned: true,
	});
	if (!compatible.copyVideo) return compatible;

	const video = streams.videoStreams[0];
	const endFrame = Number(end) * frameRate(video);
	if (!Number.isFinite(endFrame) || Math.abs(endFrame - Math.round(endFrame)) > 0.001) {
		return { copyVideo: false, copyAudio: false, reason: "end_not_frame_aligned_reencode" };
	}
	let result;
	try {
		result = await probeJson(sourcePath, inputOptions, start, video);
	} catch {
		return { copyVideo: false, copyAudio: false, reason: "keyframe_probe_failed_reencode" };
	}
	const tolerance = 0.001;
	const keyframeAligned = (result.packets || []).some((packet) => {
		if (!String(packet.flags || "").includes("K")) return false;
		const timestamp = Number(packet.pts_time ?? packet.dts_time);
		return Number.isFinite(timestamp) && Math.abs(timestamp - Number(start)) <= tolerance;
	});

	return selectStreamCopyPlan({
		cropMode,
		captionsSrtPath,
		streams,
		keyframeAligned,
	});
}
