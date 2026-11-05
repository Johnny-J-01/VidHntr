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

function buildCaptionSegments(words, offset = 0, isLastChunk = true) {
    if (!Array.isArray(words) || words.length === 0) {
        return { segments: [], pendingWords: [] };
    }

    const validWords = [];
    for (const w of words) {
        const start = Number(w?.start);
        const end = Number(w?.end);

        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            const text = getWordText(w);
            if (text) {
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

    validWords.sort((a, b) => a.start - b.start || a.end - b.end);

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

        const hitHardMax =
            candidateDuration >= HARD_MAX_DURATION ||
            candidateChars >= HARD_MAX_CHARS ||
            candidateWordCount >= HARD_MAX_WORDS;

        if (hitHardMax) {
            flushCurrent();
            currentWords.push(word);
            continue;
        }

        const prevHasStrong = hasStrongPunctuation(prevWord.text);
        const currentDuration = currentEnd - segStart;

        if (prevHasStrong) {
            if (currentDuration >= SOFT_MIN_DURATION || pause >= 0.35 || !nextWord) {
                flushCurrent();
                currentWords.push(word);
                continue;
            }
        }

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

export {
    getWordText,
    cleanWordText,
    hasStrongPunctuation,
    hasMediumPunctuation,
    formatWords,
    buildCaptionSegments,
    deduplicateBoundaryWords,
};
