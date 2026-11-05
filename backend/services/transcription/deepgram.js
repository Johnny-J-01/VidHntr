import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import { CHUNK_SECONDS, splitAudio } from "./chunking.js";
import {
    getWordText,
    cleanWordText,
    hasStrongPunctuation,
    hasMediumPunctuation,
    formatWords,
    buildCaptionSegments,
    deduplicateBoundaryWords,
} from "./captions.js";
import { normalizeSegments, validateInvariants } from "./validation.js";

dotenv.config();

function getDeepgramKey() {
    if (!process.env.DEEPGRAM_API_KEY) {
        throw new Error(
            "DEEPGRAM_API_KEY is not set. Add it to your .env file."
        );
    }

    return process.env.DEEPGRAM_API_KEY;
}

async function transcribeChunk(audioPath) {
    const apiKey = getDeepgramKey();
    const audioBuffer = fs.readFileSync(audioPath);

    const params = new URLSearchParams({
        model: "nova-3",
        smart_format: "true",
        punctuate: "true",
        words: "true",
        utterances: "true",
        language: "en",
    });

    const response = await fetch(
        `https://api.deepgram.com/v1/listen?${params.toString()}`,
        {
            method: "POST",
            headers: {
                Authorization: `Token ${apiKey}`,
                "Content-Type": "audio/mpeg",
            },
            body: audioBuffer,
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Deepgram transcription failed (${response.status}): ${errorText}`
        );
    }

    return await response.json();
}

async function transcribeAudio(
    audioPath,
    totalDuration,
    onProgress,
    onChunk
) {
    const shouldSplit =
        totalDuration >
        CHUNK_SECONDS + 30;

    const chunkDir = path.join(
        path.dirname(audioPath),
        `${path.basename(
            audioPath,
            path.extname(audioPath)
        )}-chunks`
    );

    const chunks = shouldSplit
        ? await splitAudio(
              audioPath,
              chunkDir,
              totalDuration
          )
        : [
              {
                  path: audioPath,
                  offset: 0,
                  index: 0,
              },
          ];

    const allSegments = [];
    let pendingBoundaryWords = [];
    let lastGlobalEnd = 0;

    console.log(
        `Starting Deepgram transcription: ${chunks.length} chunk(s)`
    );

    try {
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];
            const isLastChunk = index === chunks.length - 1;

            console.log(
                `Transcribing chunk ${index + 1}/${chunks.length}: ${chunk.path}`
            );

            const result = await transcribeChunk(chunk.path);

            let rawWords =
                result?.results?.channels?.[0]?.alternatives?.[0]?.words || [];

            if (rawWords.length === 0) {
                console.warn(
                    `Deepgram returned no words for chunk ${index + 1}`
                );
            }

            if (pendingBoundaryWords.length > 0) {
                rawWords = deduplicateBoundaryWords(
                    pendingBoundaryWords,
                    rawWords,
                    chunk.offset
                );

                rawWords = [
                    ...pendingBoundaryWords,
                    ...rawWords,
                ];

                pendingBoundaryWords = [];
            }

            const { segments, pendingWords } = buildCaptionSegments(
                rawWords,
                chunk.offset,
                isLastChunk
            );

            pendingBoundaryWords = pendingWords;

            const chunkSegments = normalizeSegments(
                segments,
                totalDuration,
                lastGlobalEnd
            );

            if (chunkSegments.length > 0) {
                lastGlobalEnd =
                    chunkSegments[chunkSegments.length - 1].end;
            }

            allSegments.push(...chunkSegments);

            const completedChunks = index + 1;
            const progress = Math.round(
                (completedChunks / chunks.length) * 100
            );

            console.log(
                `Deepgram chunk ${index + 1} complete: ${chunkSegments.length} caption segments (lastEnd: ${lastGlobalEnd.toFixed(3)}s)`
            );

            if (onProgress) {
                await onProgress(progress);
            }

            if (onChunk) {
                await onChunk(chunkSegments, {
                    chunkIndex: chunk.index,
                    chunkStart: chunk.offset,
                    chunkEnd: Math.min(
                        chunk.offset + CHUNK_SECONDS,
                        totalDuration
                    ),
                    completedChunks,
                    totalChunks: chunks.length,
                    progress,
                });
            }

            if (shouldSplit && fs.existsSync(chunk.path)) {
                fs.rmSync(chunk.path, {
                    force: true,
                });
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

    const finalSegments = normalizeSegments(
        allSegments,
        totalDuration,
        0
    );

    validateInvariants(finalSegments, totalDuration);

    console.log(
        `Deepgram transcription complete: ${finalSegments.length} total caption segments verified with 0 overlaps.`
    );

    return finalSegments;
}

export {
    transcribeAudio,
    getDeepgramKey,
    splitAudio,
    transcribeChunk,
    getWordText,
    cleanWordText,
    hasStrongPunctuation,
    hasMediumPunctuation,
    formatWords,
    buildCaptionSegments,
    deduplicateBoundaryWords,
    normalizeSegments,
    validateInvariants,
    CHUNK_SECONDS,
};

export default {
    transcribeAudio,
};
