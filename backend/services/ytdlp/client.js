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

	// Only pass cookies if the cookies file actually exists and is not empty
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

function isValidYouTubeUrl(url) {
	return typeof url === "string" && YOUTUBE_URL_RE.test(url.trim());
}

function downloadYouTubeAudio(url, outputDir, id, onProgress) {
	return new Promise((resolve, reject) => {
		fs.mkdirSync(outputDir, { recursive: true });

		const outputTemplate = path.join(outputDir, `${id}.%(ext)s`);

		const args = [
			url,
			...getBypassArgs(),
			"-f",
			"bestaudio/best",
			"-x",
			"--audio-format",
			"mp3",
			"--audio-quality",
			"32K",
			"--postprocessor-args",
			"ffmpeg:-ar 16000 -ac 1",
			...FFMPEG_LOCATION_ARGS,
			"-o",
			outputTemplate,
			"--no-playlist",
			"--print",
			"after_move:filepath",
			"--newline",
		];

		const proc = spawn(resolveYtDlpPath(), args, { windowsHide: true });

		let resolvedPath = null;
		let stderrBuf = "";

		proc.stdout.on("data", (chunk) => {
			const text = chunk.toString();
			const progressMatch = text.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);

			if (progressMatch && onProgress) {
				onProgress(Math.min(99, Math.round(parseFloat(progressMatch[1]))));
			}

			const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
			for (const line of lines) {
				if (line.toLowerCase().endsWith(".mp3") && !line.startsWith("[")) {
					resolvedPath = line;
				}
			}
		});

		proc.stderr.on("data", (chunk) => {
			stderrBuf += chunk.toString();
		});

		proc.on("error", (error) => {
			reject(new Error(`yt-dlp failed to start: ${error.message}`));
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`yt-dlp audio download failed.\n${stderrBuf}`));
				return;
			}

			if (onProgress) {
				onProgress(100);
			}

			resolve({
				filePath: resolvedPath || path.join(outputDir, `${id}.mp3`),
			});
		});
	});
}

function downloadYouTubeVideo(url, outputDir, id, onProgress) {
	return new Promise((resolve, reject) => {
		fs.mkdirSync(outputDir, { recursive: true });

		const outputTemplate = path.join(outputDir, `${id}.%(ext)s`);

		const args = [
			url,
			...getBypassArgs(),
			"-f",
			"bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
			"--merge-output-format",
			"mp4",
			...FFMPEG_LOCATION_ARGS,
			"-o",
			outputTemplate,
			"--no-playlist",
			"--print",
			"after_move:filepath",
			"--newline",
		];

		const proc = spawn(resolveYtDlpPath(), args, { windowsHide: true });

		let resolvedPath = null;
		let stderrBuf = "";

		proc.stdout.on("data", (chunk) => {
			const text = chunk.toString();
			const progressMatch = text.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);

			if (progressMatch && onProgress) {
				onProgress(Math.min(99, Math.round(parseFloat(progressMatch[1]))));
			}

			const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
			for (const line of lines) {
				if (line.toLowerCase().endsWith(".mp4") && !line.startsWith("[")) {
					resolvedPath = line;
				}
			}
		});

		proc.stderr.on("data", (chunk) => {
			stderrBuf += chunk.toString();
		});

		proc.on("error", (error) => {
			reject(new Error(`yt-dlp failed to start: ${error.message}`));
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`YouTube video download failed.\n${stderrBuf}`));
				return;
			}

			if (onProgress) {
				onProgress(100);
			}

			resolve({
				filePath: resolvedPath || path.join(outputDir, `${id}.mp4`),
			});
		});
	});
}

function downloadYouTubeVideoSection(url, outputDir, id, start, end, onProgress) {
	return new Promise((resolve, reject) => {
		fs.mkdirSync(outputDir, { recursive: true });

		const sectionStart = Math.max(0, Number(start) || 0);
		const sectionEnd = Number(end);

		if (!Number.isFinite(sectionEnd) || sectionEnd <= sectionStart) {
			reject(new Error("Invalid YouTube export section."));
			return;
		}

		const outputTemplate = path.join(outputDir, `${id}.%(ext)s`);
		const section = `*${sectionStart}-${sectionEnd}`;

		const args = [
			url,
			...getBypassArgs(),
			"-f",
			"bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
			"--download-sections",
			section,
			"--force-keyframes-at-cuts",
			"--merge-output-format",
			"mp4",
			...FFMPEG_LOCATION_ARGS,
			"-o",
			outputTemplate,
			"--no-playlist",
			"--print",
			"after_move:filepath",
			"--newline",
		];

		const proc = spawn(resolveYtDlpPath(), args, { windowsHide: true });

		let resolvedPath = null;
		let stderrBuf = "";

		proc.stdout.on("data", (chunk) => {
			const text = chunk.toString();
			const progressMatch = text.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);

			if (progressMatch && onProgress) {
				onProgress(Math.min(99, Math.round(parseFloat(progressMatch[1]))));
			}

			const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
			for (const line of lines) {
				if (line.toLowerCase().endsWith(".mp4") && !line.startsWith("[")) {
					resolvedPath = line;
				}
			}
		});

		proc.stderr.on("data", (chunk) => {
			stderrBuf += chunk.toString();
		});

		proc.on("error", (error) => {
			reject(new Error(`yt-dlp failed to start: ${error.message}`));
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`YouTube section download failed.\n${stderrBuf}`));
				return;
			}

			if (onProgress) {
				onProgress(100);
			}

			resolve({
				filePath: resolvedPath || path.join(outputDir, `${id}.mp4`),
			});
		});
	});
}

function downloadYouTubeSubtitles(url, outputDir, id, languages = "en.*", onProgress) {
	return new Promise((resolve, reject) => {
		fs.mkdirSync(outputDir, { recursive: true });

		const outputTemplate = path.join(outputDir, `${id}.%(language)s.%(ext)s`);

		const args = [
			url,
			...getBypassArgs(),
			"--skip-download",
			"--write-subs",
			"--write-auto-subs",
			"--sub-langs",
			languages,
			"--sub-format",
			"srt",
			"--convert-subs",
			"srt",
			...FFMPEG_LOCATION_ARGS,
			"-o",
			outputTemplate,
			"--no-playlist",
			"--no-warnings",
			"--newline",
		];

		const proc = spawn(resolveYtDlpPath(), args, { windowsHide: true });
		let stderrBuf = "";

		proc.stdout.on("data", (chunk) => {
			const text = chunk.toString();
			const progressMatch = text.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);

			if (progressMatch && onProgress) {
				onProgress(Math.min(99, Math.round(parseFloat(progressMatch[1]))));
			}
		});

		proc.stderr.on("data", (chunk) => {
			stderrBuf += chunk.toString();
		});

		proc.on("error", (error) => {
			reject(new Error(`yt-dlp failed to start: ${error.message}`));
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`YouTube subtitles download failed.\n${stderrBuf}`));
				return;
			}

			const files = fs.readdirSync(outputDir)
				.filter((file) => file.startsWith(`${id}.`) && file.endsWith(".srt"));

			if (!files.length) {
				reject(new Error("No YouTube captions were available."));
				return;
			}

			const manualSubtitles = files.filter((file) => !file.includes(".auto."));
			const selectedFile = manualSubtitles[0] || files[0];

			if (onProgress) {
				onProgress(100);
			}

			resolve({
				filePath: path.join(outputDir, selectedFile),
			});
		});
	});
}

function downloadYouTube(url, outputDir, id, onProgress) {
	return downloadYouTubeVideo(url, outputDir, id, onProgress);
}

function fetchMetadata(url) {
	return new Promise((resolve, reject) => {
		const args = [
			url,
			...getBypassArgs(),
			"--dump-json",
			"--no-playlist",
			"--no-warnings",
		];

		const proc = spawn(resolveYtDlpPath(), args, { windowsHide: true });
		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		proc.on("error", (error) => {
			reject(error);
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`Failed to fetch YouTube metadata.\n${stderr}`));
				return;
			}

			try {
				resolve(JSON.parse(stdout));
			} catch (error) {
				reject(new Error(`Could not parse YouTube metadata: ${error.message}`));
			}
		});
	});
}

export {
	isValidYouTubeUrl,
	downloadYouTubeAudio,
	downloadYouTubeVideo,
	downloadYouTubeVideoSection,
	downloadYouTubeSubtitles,
	downloadYouTube,
	fetchMetadata,
};

export default {
	isValidYouTubeUrl,
	downloadYouTubeAudio,
	downloadYouTubeVideo,
	downloadYouTubeVideoSection,
	downloadYouTubeSubtitles,
	downloadYouTube,
	fetchMetadata,
};