import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import ffmpeg from "fluent-ffmpeg";
import dotenv from 'dotenv'; 

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FFMPEG_DIR = path.join(__dirname, "..", "..", "ffmpeg-9.0.1-essentials_build", "bin");
const FFMPEG_PATH = path.join(FFMPEG_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

ffmpeg.setFfmpegPath(FFMPEG_PATH);

const CHUNK_SECONDS = 300;

function getClient() {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set. Add it to your .env file to enable transcription.");
    }

    return new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
    });
}

function splitAudio(audioPath, chunkDir, totalDuration) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(chunkDir)) {
            fs.mkdirSync(chunkDir, { recursive: true });
        }

        const chunkCount = Math.max(1, Math.ceil(totalDuration / CHUNK_SECONDS));
        const chunks = [];
        let index = 0;

        function next() {
            if (index >= chunkCount) {
                resolve(chunks);
                return;
            }

            const start = index * CHUNK_SECONDS;
            const outPath = path.join(chunkDir, `chunk-${index}.mp3`);

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

async function transcribeAudio(audioPath, totalDuration, onProgress, onChunk) {
    const client = getClient();

    const chunkDir = path.join(
        path.dirname(audioPath),
        `${path.basename(audioPath, path.extname(audioPath))}-chunks`
    );

    const shouldSplit = totalDuration > CHUNK_SECONDS + 30;

    const chunks = shouldSplit
        ? await splitAudio(audioPath, chunkDir, totalDuration)
        : [{ path: audioPath, offset: 0, index: 0 }];

    const allSegments = [];

    try {
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];

            console.log(`Transcribing chunk ${index + 1}/${chunks.length}: ${chunk.path}`);

            const uploadedFile = await client.files.upload({
                file: chunk.path,
                config: {
                    mimeType: "audio/mpeg",
                },
            });

            const response = await client.models.generateContent({
                model: "gemini-3.5-flash-lite",
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                fileData: {
                                    fileUri: uploadedFile.uri,
                                    mimeType: uploadedFile.mimeType,
                                },
                            },
                            {
                                text: `
Transcribe all spoken words in this audio.

Return ONLY the transcript.

For every spoken section, include timestamps in exactly this format:

[MM:SS - MM:SS] spoken text

Rules:
- Include all spoken words.
- Do not summarize.
- Do not explain anything.
- Do not add headings.
- Do not add markdown.
- Keep timestamps accurate.
- Start timestamps from the beginning of this audio chunk.
                                `.trim(),
                            },
                        ],
                    },
                ],
            });

            const transcriptText =
                response?.text ||
                response?.candidates?.[0]?.content?.parts
                    ?.map((part) => part.text || "")
                    .join(" ")
                    .trim() ||
                "";

            if (!transcriptText) {
                throw new Error(`Gemini returned an empty transcription for chunk ${index + 1}.`);
            }

            const chunkSegments = parseTimestampedTranscript(
                transcriptText,
                chunk.offset
            );

            allSegments.push(...chunkSegments);

            const completedChunks = index + 1;
            const progress = Math.round((completedChunks / chunks.length) * 100);

            if (onProgress) {
                await onProgress(progress);
            }

            if (onChunk) {
                await onChunk(chunkSegments, {
                    chunkIndex: chunk.index,
                    chunkStart: chunk.offset,
                    chunkEnd: Math.min(chunk.offset + CHUNK_SECONDS, totalDuration),
                    completedChunks,
                    totalChunks: chunks.length,
                    progress,
                });
            }

            if (shouldSplit && fs.existsSync(chunk.path)) {
                fs.rmSync(chunk.path, { force: true });
            }
        }
    } finally {
        if (shouldSplit && fs.existsSync(chunkDir)) {
            fs.rmSync(chunkDir, {
                recursive: true,
                force: true,
            });
        }
    }

    return allSegments;
}

function parseTimestampedTranscript(text, offset = 0) {
    const segments = [];
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
        const match = line.match(
            /^\s*\[(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\]\s*(.+?)\s*$/
        );

        if (!match) continue;

        const startMinutes = Number(match[1]);
        const startSeconds = Number(match[2]);
        const endMinutes = Number(match[3]);
        const endSeconds = Number(match[4]);
        const textValue = match[5].trim();

        if (!textValue) continue;

        const start = startMinutes * 60 + startSeconds + offset;
        const end = endMinutes * 60 + endSeconds + offset;

        segments.push({
            start: Number(start.toFixed(2)),
            end: Number(end.toFixed(2)),
            text: textValue,
        });
    }

    return segments;
}

export { transcribeAudio };

export default {
    transcribeAudio,
};