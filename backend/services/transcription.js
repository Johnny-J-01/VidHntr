import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FFMPEG_DIR = path.join(
    __dirname,
    "..",
    "..",
    "ffmpeg-9.0.1-essentials_build",
    "bin"
);

const FFMPEG_PATH = path.join(
    FFMPEG_DIR,
    process.platform === "win32"
        ? "ffmpeg.exe"
        : "ffmpeg"
);

console.log(
    "Transcription FFmpeg path:",
    FFMPEG_PATH
);

console.log(
    "Transcription FFmpeg exists:",
    fs.existsSync(FFMPEG_PATH)
);

if (!fs.existsSync(FFMPEG_PATH)) {
    throw new Error(
        `FFmpeg executable not found at: ${FFMPEG_PATH}`
    );
}

ffmpeg.setFfmpegPath(FFMPEG_PATH);

const CHUNK_SECONDS = 300;

/*
|--------------------------------------------------------------------------
| Deepgram Configuration
|--------------------------------------------------------------------------
*/

function getDeepgramKey() {
    if (!process.env.DEEPGRAM_API_KEY) {
        throw new Error(
            "DEEPGRAM_API_KEY is not set. Add it to your .env file."
        );
    }

    return process.env.DEEPGRAM_API_KEY;
}

/*
|--------------------------------------------------------------------------
| Audio Chunking
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Deepgram API Call
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Word & Text Helpers
|--------------------------------------------------------------------------
*/

function getWordText(word) {
    return String(
        word?.punctuated_word ||
        word?.word ||
        ""
    ).trim();
}

function cleanWordText(text) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasStrongPunctuation(text) {
    return /[.?!]["')\]}]*$/.test(text);
}

function hasMediumPunctuation(text) {
    return /[,;:—–]["')\]}]*$/.test(text);
}

function formatWords(words) {
    return words
        .map(getWordText)
        .filter(Boolean)
        .join(" ")
        .replace(/\s+([,.!?;:—–])/g, "$1")
        .trim();
}

/*
|--------------------------------------------------------------------------
| Speech-Aware Caption Segmenter
|
| Priority Order:
| 1. Strong punctuation (. ? !)
| 2. Medium punctuation (, ; : —) & meaningful speech pauses
| 3. Soft limits: ~2–4s duration, ~32–60 chars
|
| Guardrails:
| - Hard max duration ~4.8s
| - Merge ultra-short segments (< 0.75s / lone word)
| - Carry over incomplete sentence fragments across chunk boundaries
| - Strictly enforce non-overlapping segments (segment[i].end <= segment[i+1].start)
|--------------------------------------------------------------------------
*/

function buildCaptionSegments(words, offset = 0, isLastChunk = true) {
    if (!Array.isArray(words) || words.length === 0) {
        return { segments: [], pendingWords: [] };
    }

    // 1. Sanitize and apply chunk offset
    const validWords = [];
    for (const w of words) {
        const start = Number(w?.start);
        const end = Number(w?.end);

        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            const text = getWordText(w);
            if (text) {
                // If w already has an absolute timestamp (e.g. carried over from prior chunk),
                // do not double-add offset.
                const hasOffsetApplied = w._absoluteOffsetApplied === true;
                const wordStart = hasOffsetApplied ? start : Math.max(0, start + offset);
                const wordEnd = hasOffsetApplied ? end : Math.max(0, end + offset);

                validWords.push({
                    start: wordStart,
                    end: wordEnd,
                    text,
                    word: w.word,
                    punctuated_word: w.punctuated_word,
                    _absoluteOffsetApplied: true,
                });
            }
        }
    }

    if (validWords.length === 0) {
        return { segments: [], pendingWords: [] };
    }

    // Ensure words are sorted chronologically
    validWords.sort((a, b) => a.start - b.start || a.end - b.end);

    // Diagnostic logging: Detect STT word-level timestamp overlaps
    let sttOverlapCount = 0;
    for (let i = 0; i < validWords.length - 1; i++) {
        const w1 = validWords[i];
        const w2 = validWords[i + 1];
        if (w1.end > w2.start) {
            sttOverlapCount++;
            if (sttOverlapCount <= 3) {
                console.log(
                    `[Debug STT Overlap] Word "${w1.text}" (ends ${w1.end.toFixed(3)}s) overlaps "${w2.text}" (starts ${w2.start.toFixed(3)}s) by ${((w1.end - w2.start) * 1000).toFixed(1)}ms`
                );
            }
        }
    }
    if (sttOverlapCount > 3) {
        console.log(
            `[Debug STT Overlap] ... and ${sttOverlapCount - 3} more word timestamp overlaps detected from STT.`
        );
    }

    const segments = [];
    let currentWords = [];

    const SOFT_MIN_DURATION = 1.2;
    const SOFT_MAX_DURATION = 3.8;
    const HARD_MAX_DURATION = 4.8;
    const SOFT_MAX_CHARS = 55;
    const HARD_MAX_CHARS = 72;
    const HARD_MAX_WORDS = 13;

    function flushCurrent() {
        if (currentWords.length === 0) return;

        const first = currentWords[0];
        const last = currentWords[currentWords.length - 1];
        const text = formatWords(currentWords);

        if (text && last.end > first.start) {
            segments.push({
                start: Number(first.start.toFixed(3)),
                end: Number(last.end.toFixed(3)),
                text,
            });
        }

        currentWords = [];
    }

    for (let i = 0; i < validWords.length; i++) {
        const word = validWords[i];
        const nextWord = validWords[i + 1];

        if (currentWords.length === 0) {
            currentWords.push(word);
            continue;
        }

        const segStart = currentWords[0].start;
        const currentEnd = currentWords[currentWords.length - 1].end;
        const candidateEnd = word.end;
        const candidateDuration = candidateEnd - segStart;
        const candidateText = formatWords([...currentWords, word]);
        const candidateChars = candidateText.length;
        const candidateWordCount = currentWords.length + 1;

        const prevWord = currentWords[currentWords.length - 1];
        const pause = Math.max(0, word.start - currentEnd);

        // Guardrail: Hard limits
        const hitHardMax =
            candidateDuration >= HARD_MAX_DURATION ||
            candidateChars >= HARD_MAX_CHARS ||
            candidateWordCount >= HARD_MAX_WORDS;

        if (hitHardMax) {
            flushCurrent();
            currentWords.push(word);
            continue;
        }

        // Priority 1: Strong punctuation on previous word (. ? !)
        const prevHasStrong = hasStrongPunctuation(prevWord.text);
        const currentDuration = currentEnd - segStart;

        if (prevHasStrong) {
            if (currentDuration >= SOFT_MIN_DURATION || pause >= 0.35 || !nextWord) {
                flushCurrent();
                currentWords.push(word);
                continue;
            }
        }

        // Priority 2: Medium punctuation (, ; : —) or meaningful speech pause
        const prevHasMedium = hasMediumPunctuation(prevWord.text);
        const hasMediumPause = pause >= 0.45;
        const hasLongPause = pause >= 0.75;

        if (hasLongPause && currentDuration >= 0.8) {
            flushCurrent();
            currentWords.push(word);
            continue;
        }

        if (
            (prevHasMedium || hasMediumPause) &&
            (currentDuration >= 1.8 || candidateChars >= 36)
        ) {
            flushCurrent();
            currentWords.push(word);
            continue;
        }

        // Priority 3: Soft limits (~2–4s duration, ~32–60 chars)
        if (
            candidateDuration >= SOFT_MAX_DURATION ||
            candidateChars >= SOFT_MAX_CHARS
        ) {
            if (pause >= 0.2 || candidateWordCount >= 8) {
                flushCurrent();
                currentWords.push(word);
                continue;
            }
        }

        currentWords.push(word);
    }

    // Cross-chunk boundary handling:
    // If this is not the final chunk and the trailing phrase ends mid-thought
    // without strong punctuation, hold over those words to be completed in the next chunk.
    let pendingWords = [];
    if (!isLastChunk && currentWords.length > 0) {
        const lastWord = currentWords[currentWords.length - 1];
        const hasStrong = hasStrongPunctuation(lastWord.text);
        const dur = lastWord.end - currentWords[0].start;

        if (!hasStrong && dur < 4.0 && currentWords.length <= 8) {
            pendingWords = currentWords;
            console.log(
                `[Chunk Boundary] Holding over ${pendingWords.length} words across chunk boundary: "${formatWords(pendingWords)}"`
            );
            currentWords = [];
        } else {
            flushCurrent();
        }
    } else {
        flushCurrent();
    }

    // Guardrail: Merge ultra-short segments (< 0.75s or lone single word)
    const merged = [];
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segDuration = seg.end - seg.start;
        const isUltraShort =
            segDuration < 0.75 ||
            seg.text.split(/\s+/).length <= 1;

        if (isUltraShort && merged.length > 0) {
            const prev = merged[merged.length - 1];
            const combinedText = `${prev.text} ${seg.text}`
                .replace(/\s+([,.!?;:—–])/g, "$1")
                .trim();
            const combinedDuration = seg.end - prev.start;
            const pauseToPrev = seg.start - prev.end;

            if (
                combinedText.length <= HARD_MAX_CHARS &&
                combinedDuration <= HARD_MAX_DURATION &&
                pauseToPrev < 1.0
            ) {
                prev.end = seg.end;
                prev.text = combinedText;
                continue;
            }
        }

        merged.push(seg);
    }

    return { segments: merged, pendingWords };
}

/*
|--------------------------------------------------------------------------
| Deduplicate Cross-Chunk Boundary Words
|
| Prevents repeated words if chunk audio boundary contains duplicate speech.
|--------------------------------------------------------------------------
*/

function deduplicateBoundaryWords(pendingWords, nextChunkWords, chunkOffset) {
    if (
        !Array.isArray(pendingWords) ||
        pendingWords.length === 0 ||
        !Array.isArray(nextChunkWords) ||
        nextChunkWords.length === 0
    ) {
        return nextChunkWords;
    }

    let duplicateCount = 0;
    const maxCheck = Math.min(pendingWords.length, nextChunkWords.length, 5);

    for (let count = maxCheck; count >= 1; count--) {
        let match = true;
        for (let j = 0; j < count; j++) {
            const pWord = cleanWordText(
                getWordText(pendingWords[pendingWords.length - count + j])
            );
            const nWord = cleanWordText(
                getWordText(nextChunkWords[j])
            );
            const nStartAbs = Number(nextChunkWords[j].start) + chunkOffset;
            const pEndAbs = Number(
                pendingWords[pendingWords.length - count + j].end
            );

            if (pWord !== nWord || Math.abs(nStartAbs - pEndAbs) > 2.0) {
                match = false;
                break;
            }
        }

        if (match) {
            duplicateCount = count;
            break;
        }
    }

    if (duplicateCount > 0) {
        console.log(
            `[Chunk Boundary] Deduplicated ${duplicateCount} repeated boundary word(s).`
        );
    }

    return nextChunkWords.slice(duplicateCount);
}

/*
|--------------------------------------------------------------------------
| Normalize & Validate Segments
|
| Enforces all Required Invariants:
| 1. start >= 0
| 2. end > start
| 3. end <= totalDuration
| 4. Segments sorted chronologically
| 5. previous.end <= current.start (Strictly no overlaps)
| 6. No duplicate segments from boundary reprocessing
|--------------------------------------------------------------------------
*/

function normalizeSegments(segments, totalDuration, lastGlobalEnd = 0) {
    if (!Array.isArray(segments) || segments.length === 0) {
        return [];
    }

    const validDuration =
        typeof totalDuration === "number" && totalDuration > 0
            ? totalDuration
            : Infinity;

    // Filter valid segment entries and sort chronologically
    const list = segments
        .map((s) => ({
            start: Number(s.start),
            end: Number(s.end),
            text: String(s.text || "").trim(),
        }))
        .filter(
            (s) =>
                s.text &&
                Number.isFinite(s.start) &&
                Number.isFinite(s.end)
        )
        .sort((a, b) => a.start - b.start || a.end - b.end);

    const result = [];
    let prevEnd = lastGlobalEnd;

    for (let i = 0; i < list.length; i++) {
        const current = list[i];

        // Invariant 1: start >= 0
        let start = Math.max(0, current.start);
        let end = current.end;

        // Invariant 3: end <= totalDuration
        if (Number.isFinite(validDuration)) {
            start = Math.min(validDuration, start);
            end = Math.min(validDuration, end);
        }

        // Invariant 6: Deduplication check
        if (result.length > 0) {
            const last = result[result.length - 1];
            if (
                last.text.toLowerCase() === current.text.toLowerCase() &&
                Math.abs(start - last.start) < 2.0
            ) {
                console.log(
                    `[Deduplication] Dropped duplicate segment: "${current.text}"`
                );
                continue;
            }
        }

        // Invariant 5: previous.end <= current.start (Resolve Overlaps)
        if (start < prevEnd) {
            const overlap = prevEnd - start;

            if (result.length > 0) {
                const prev = result[result.length - 1];

                if (overlap <= 0.100) {
                    // Sub-100ms overlap (float precision / STT frame jitter):
                    // Resolve at midpoint without discarding real word timing
                    const mid = Number(
                        ((prevEnd + start) / 2).toFixed(3)
                    );

                    if (
                        mid > prev.start + 0.05 &&
                        mid < end - 0.05
                    ) {
                        prev.end = mid;
                        start = mid;
                    } else if (start >= prev.start + 0.05) {
                        prev.end = start;
                    } else {
                        start = prev.end;
                    }
                } else {
                    // Larger overlap:
                    // If previous segment can be trimmed to where current starts
                    if (start >= prev.start + 0.20) {
                        prev.end = start;
                    } else {
                        // Otherwise push current start to previous end
                        start = prev.end;
                    }
                }

                prevEnd = prev.end;
            } else {
                start = prevEnd;
            }
        }

        // Invariant 2: end > start
        if (end <= start) {
            end = Math.min(validDuration, start + 0.3);
            if (end <= start) {
                if (start > 0.3) {
                    start = Math.max(0, end - 0.3);
                } else {
                    continue; // Skip invalid zero/negative duration at absolute boundary
                }
            }
        }

        // Format to millisecond precision (3 decimal places)
        start = Number(start.toFixed(3));
        end = Number(end.toFixed(3));

        if (end <= start) {
            continue;
        }

        // Guard against any remaining floating point rounding drift
        if (result.length > 0) {
            const prev = result[result.length - 1];
            if (prev.end > start) {
                start = prev.end;
            }
        }

        result.push({
            start,
            end,
            text: current.text,
        });

        prevEnd = end;
    }

    return result;
}

/*
|--------------------------------------------------------------------------
| Invariant Verification
|--------------------------------------------------------------------------
*/

function validateInvariants(segments, totalDuration) {
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        if (seg.start < 0) {
            throw new Error(
                `Invariant 1 violated: start < 0 at index ${i} (${seg.start})`
            );
        }

        if (seg.end <= seg.start) {
            throw new Error(
                `Invariant 2 violated: end <= start at index ${i} (${seg.start} -> ${seg.end})`
            );
        }

        if (
            typeof totalDuration === "number" &&
            totalDuration > 0 &&
            seg.end > totalDuration + 0.001
        ) {
            throw new Error(
                `Invariant 3 violated: end > totalDuration at index ${i} (${seg.end} > ${totalDuration})`
            );
        }

        if (i > 0) {
            const prev = segments[i - 1];

            if (seg.start < prev.start) {
                throw new Error(
                    `Invariant 4 violated: segments not sorted chronologically at index ${i}`
                );
            }

            if (prev.end > seg.start) {
                throw new Error(
                    `Invariant 5 violated: overlap between [${i - 1}] (${prev.end}) and [${i}] (${seg.start})`
                );
            }
        }
    }

    return true;
}

/*
|--------------------------------------------------------------------------
| Main Transcription Pipeline
|--------------------------------------------------------------------------
*/

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

            // Cross-chunk boundary processing:
            // If words were held over from previous chunk, deduplicate and prepend
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

            // Build speech-aware segments for this chunk
            const { segments, pendingWords } = buildCaptionSegments(
                rawWords,
                chunk.offset,
                isLastChunk
            );

            pendingBoundaryWords = pendingWords;

            // Normalize and resolve any overlaps against prior chunk's end
            const chunkSegments = normalizeSegments(
                segments,
                totalDuration,
                lastGlobalEnd
            );

            // Update cross-chunk global tracking
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

    // Final normalization and validation pass across all combined segments
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
};

export default {
    transcribeAudio,
};