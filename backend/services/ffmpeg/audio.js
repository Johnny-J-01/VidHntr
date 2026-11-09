import ffmpeg from "./instance.js";
import fs from "fs";
import path from "path";

export function extractAudio(videoPath, audioOutPath) {
	return new Promise((resolve, reject) => {
		ffmpeg(videoPath)
			.noVideo()
			.audioCodec("libmp3lame")
			.audioChannels(1)
			.audioFrequency(16000)
			.outputOptions(["-threads 1"])
			.output(audioOutPath)
			.on("end", () => resolve(audioOutPath))
			.on("error", (error) => reject(error))
			.run();
	});
}

export function generateThumbnail(videoPath, outDir, id, atSeconds = 3) {
	return new Promise((resolve, reject) => {
		const filename = `${id}.jpg`;

		fs.mkdirSync(outDir, {
			recursive: true,
		});

		ffmpeg(videoPath)
			.outputOptions(["-threads 1"])
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
