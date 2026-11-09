import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localFfmpeg = path.resolve(__dirname, "..", "..", "..", "ffmpeg-9.0.1-essentials_build", "bin", "ffmpeg.exe");
const localFfprobe = path.resolve(__dirname, "..", "..", "..", "ffmpeg-9.0.1-essentials_build", "bin", "ffprobe.exe");

const FFMPEG_PATH = process.env.FFMPEG_PATH || (fs.existsSync(localFfmpeg) ? localFfmpeg : "ffmpeg");
const FFPROBE_PATH = process.env.FFPROBE_PATH || (fs.existsSync(localFfprobe) ? localFfprobe : "ffprobe");

ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);
export default ffmpeg;