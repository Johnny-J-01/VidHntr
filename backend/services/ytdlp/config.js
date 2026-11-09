import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localFfmpegDir = path.join(__dirname, "..", "..", "..", "ffmpeg-9.0.1-essentials_build", "bin");

const FFMPEG_LOCATION_ARGS = fs.existsSync(localFfmpegDir)
	? ["--ffmpeg-location", localFfmpegDir]
	: [];

const YOUTUBE_URL_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/i;

function getBypassArgs() {
	const args = [
		"--js-runtimes", "node",
		"--extractor-args", "youtube:player_client=mweb,tv,web_creator,web",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	];

	const localCookiePath = path.join(__dirname, "..", "..", "cookies.txt");

	if (fs.existsSync(localCookiePath) && fs.statSync(localCookiePath).size > 0) {
		args.push("--cookies", localCookiePath);
	} else if (process.env.YOUTUBE_COOKIES_BASE64) {
		const cookiePath = path.join("/tmp", "yt_cookies_fresh.txt");
		try {
			const decoded = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, "base64").toString("utf-8");
			fs.writeFileSync(cookiePath, decoded);
			args.push("--cookies", cookiePath);
		} catch (e) {
			console.error("Failed to write YouTube cookies:", e);
		}
	}

	return args;
}

function resolveYtDlpPath() {
	if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
		return process.env.YTDLP_PATH;
	}

	const binDir = path.join(__dirname, "..", "..", "bin");

	const candidates = process.platform === "win32"
		? [path.join(binDir, "yt-dlp.exe")]
		: [path.join(binDir, "yt-dlp"), path.join(binDir, "yt-dlp.exe")];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return "yt-dlp";
}

export { FFMPEG_LOCATION_ARGS, YOUTUBE_URL_RE, getBypassArgs, resolveYtDlpPath };
