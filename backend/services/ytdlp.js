import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FFmpeg is stored inside the project.
const FFMPEG_DIR = path.join(
    __dirname,
    "..",
    "..",
    "ffmpeg-9.0.1-essentials_build",
    "bin"
);

const YOUTUBE_URL_RE =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/i;

function resolveYtDlpPath() {
    if (
        process.env.YTDLP_PATH &&
        fs.existsSync(process.env.YTDLP_PATH)
    ) {
        return process.env.YTDLP_PATH;
    }

    const binDir = path.join(__dirname, "..", "bin");

    const candidates =
        process.platform === "win32"
            ? [path.join(binDir, "yt-dlp.exe")]
            : [
                  path.join(binDir, "yt-dlp"),
                  path.join(binDir, "yt-dlp.exe"),
              ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return "yt-dlp";
}

function isValidYouTubeUrl(url) {
    return (
        typeof url === "string" &&
        YOUTUBE_URL_RE.test(url.trim())
    );
}

function downloadYouTubeAudio(
    url,
    outputDir,
    id,
    onProgress
) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(outputDir, { recursive: true });

        const outputTemplate = path.join(
            outputDir,
            `${id}.%(ext)s`
        );

        const args = [
            url,
            "-f",
            "bestaudio/best",
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "32K",
            "--postprocessor-args",
            "ffmpeg:-ar 16000 -ac 1",
            "--ffmpeg-location",
            FFMPEG_DIR,
            "-o",
            outputTemplate,
            "--no-playlist",
            "--print",
            "after_move:filepath",
            "--newline",
        ];

        const proc = spawn(
            resolveYtDlpPath(),
            args,
            { windowsHide: true }
        );

        let resolvedPath = null;
        let stderrBuf = "";

        proc.stdout.on("data", (chunk) => {
            const text = chunk.toString();

            const progressMatch = text.match(
                /\[download\]\s+(\d{1,3}(?:\.\d+)?)%/
            );

            if (progressMatch && onProgress) {
                onProgress(
                    Math.min(
                        99,
                        Math.round(
                            parseFloat(progressMatch[1])
                        )
                    )
                );
            }

            const lines = text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);

            for (const line of lines) {
                if (
                    line.toLowerCase().endsWith(".mp3") &&
                    !line.startsWith("[")
                ) {
                    resolvedPath = line;
                }
            }
        });

        proc.stderr.on("data", (chunk) => {
            stderrBuf += chunk.toString();
        });

        proc.on("error", (err) => {
            reject(
                new Error(
                    `yt-dlp failed to start: ${err.message}`
                )
            );
        });

        proc.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `yt-dlp audio download failed.\n${stderrBuf}`
                    )
                );
                return;
            }

            if (onProgress) {
                onProgress(100);
            }

            resolve({
                filePath:
                    resolvedPath ||
                    path.join(outputDir, `${id}.mp3`),
            });
        });
    });
}

function downloadYouTubeVideo(
    url,
    outputDir,
    id,
    onProgress
) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(outputDir, { recursive: true });

        const outputTemplate = path.join(
            outputDir,
            `${id}.%(ext)s`
        );

        /*
         * Prefer:
         *   best MP4 video + best M4A audio
         *
         * If unavailable:
         *   best combined MP4
         *
         * Final fallback:
         *   best available format
         */
        const args = [
            url,

            "-f",
            "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",

            "--merge-output-format",
            "mp4",

            "--ffmpeg-location",
            FFMPEG_DIR,

            "-o",
            outputTemplate,

            "--no-playlist",

            "--print",
            "after_move:filepath",

            "--newline",
        ];

        const proc = spawn(
            resolveYtDlpPath(),
            args,
            { windowsHide: true }
        );

        let title = null;
        let resolvedPath = null;
        let stderrBuf = "";

        proc.stdout.on("data", (chunk) => {
            const text = chunk.toString();

            const progressMatch = text.match(
                /\[download\]\s+(\d{1,3}(?:\.\d+)?)%/
            );

            if (progressMatch && onProgress) {
                onProgress(
                    Math.min(
                        99,
                        Math.round(
                            parseFloat(progressMatch[1])
                        )
                    )
                );
            }

            const titleMatch = text.match(
                /\[download\]\s+Destination:\s*(.+)/
            );

            if (titleMatch) {
                resolvedPath = titleMatch[1].trim();
            }

            const lines = text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);

            for (const line of lines) {
                if (
                    line.toLowerCase().endsWith(".mp4") &&
                    !line.startsWith("[")
                ) {
                    resolvedPath = line;
                }
            }
        });

        proc.stderr.on("data", (chunk) => {
            stderrBuf += chunk.toString();
        });

        proc.on("error", (err) => {
            reject(
                new Error(
                    `yt-dlp failed to start: ${err.message}`
                )
            );
        });

        proc.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `YouTube video download failed.\n${stderrBuf}`
                    )
                );
                return;
            }

            if (onProgress) {
                onProgress(100);
            }

            resolve({
                filePath:
                    resolvedPath ||
                    path.join(outputDir, `${id}.mp4`),
                title,
            });
        });
    });
}

function downloadYouTube(
    url,
    outputDir,
    id,
    onProgress
) {
    return downloadYouTubeVideo(
        url,
        outputDir,
        id,
        onProgress
    );
}

function fetchMetadata(url) {
    return new Promise((resolve, reject) => {
        const args = [
            url,
            "--dump-json",
            "--no-playlist",
            "--no-warnings",
        ];

        const proc = spawn(
            resolveYtDlpPath(),
            args,
            { windowsHide: true }
        );

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        proc.on("error", (err) => {
            reject(err);
        });

        proc.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `Failed to fetch YouTube metadata.\n${stderr}`
                    )
                );
                return;
            }

            try {
                resolve(JSON.parse(stdout));
            } catch (err) {
                reject(
                    new Error(
                        `Could not parse YouTube metadata: ${err.message}`
                    )
                );
            }
        });
    });
}

export {
    isValidYouTubeUrl,
    downloadYouTubeAudio,
    downloadYouTubeVideo,
    downloadYouTube,
    fetchMetadata,
};

export default {
    isValidYouTubeUrl,
    downloadYouTubeAudio,
    downloadYouTubeVideo,
    downloadYouTube,
    fetchMetadata,
};