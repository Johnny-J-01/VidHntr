import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localFfmpeg = path.resolve(
	__dirname,
	"..",
	"..",
	"..",
	"ffmpeg-9.0.1-essentials_build",
	"bin",
	"ffmpeg.exe"
);

const FFMPEG_PATH = process.env.FFMPEG_PATH || (fs.existsSync(localFfmpeg) ? localFfmpeg : "ffmpeg");

ffmpeg.setFfmpegPath(FFMPEG_PATH);

const CHUNK_SECONDS = 300;

function splitAudio(audioPath, chunkDir, totalDuration) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(chunkDir)) {
            fs.mkdirSync(chunkDir, {
                recursive: true,
            });
        }

        const chunkCount = Math.max(
            1,
            Math.ceil(totalDuration / CHUNK_SECONDS)
        );

        const chunks = [];
        let index = 0;

        function next() {
            if (index >= chunkCount) {
                resolve(chunks);
                return;
            }

            const start = index * CHUNK_SECONDS;

            const outPath = path.join(
                chunkDir,
                `chunk-${index}.mp3`
            );

            ffmpeg(audioPath)
                .setStartTime(start)
                .setDuration(CHUNK_SECONDS)
                .audioCodec("libmp3lame")
                .audioFrequency(16000)
                .audioChannels(1)
                .audioBitrate("32k")
                .output(outPath)
                .on("end", () => {
                    chunks.push({
                        path: outPath,
                        offset: start,
                        index,
                    });

                    index += 1;
                    next();
                })
                .on("error", reject)
                .run();
        }

        next();
    });
}

export { CHUNK_SECONDS, splitAudio };
