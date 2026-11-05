export function formatSecondsShort(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secondsPart = Math.floor(seconds % 60);
    return `${minutes}:${String(secondsPart).padStart(2, "0")}`;
}

export function renderTranscriptForPrompt(transcript, startIndex = 0) {
    return transcript
        .map(
            (segment, index) =>
                `[${startIndex + index}] (${Number(segment.start).toFixed(1)}-${Number(segment.end).toFixed(1)}s) ${segment.text}`
        )
        .join("\n");
}

export function splitTranscriptForSearch(transcript, maxCharacters = 40000) {
    const chunks = [];
    let chunk = [];
    let startIndex = 0;
    let size = 0;

    transcript.forEach((segment, index) => {
        const segmentSize = String(segment.text || "").length + 48;

        if (chunk.length > 0 && size + segmentSize > maxCharacters) {
            chunks.push({ transcript: chunk, startIndex });
            chunk = [];
            startIndex = index;
            size = 0;
        }

        chunk.push(segment);
        size += segmentSize;
    });

    if (chunk.length > 0) {
        chunks.push({ transcript: chunk, startIndex });
    }

    return chunks;
}

export function expandToContextWindow(transcript, startIdx, endIdx, videoDuration) {
    const MIN_DURATION = 8;
    const TARGET_DURATION = 20;
    const MAX_DURATION = 45;

    if (!Array.isArray(transcript) || transcript.length === 0) {
        return { start: 0, end: 0 };
    }

    const duration = Number(videoDuration);

    let lo = Math.max(
        0,
        Math.min(Number(startIdx) || 0, transcript.length - 1)
    );

    let hi = Math.max(
        0,
        Math.min(Number(endIdx) || 0, transcript.length - 1)
    );

    if (hi < lo) {
        [lo, hi] = [hi, lo];
    }

    const durationOf = (low, high) =>
        Number(transcript[high].end) -
        Number(transcript[low].start);

    let guard = 0;

    while (durationOf(lo, hi) < TARGET_DURATION && guard < 200) {
        guard += 1;

        const canGrowBefore =
            lo > 0 &&
            durationOf(lo - 1, hi) <= MAX_DURATION;

        const canGrowAfter =
            hi < transcript.length - 1 &&
            durationOf(lo, hi + 1) <= MAX_DURATION;

        if (!canGrowBefore && !canGrowAfter) {
            break;
        }

        if (canGrowBefore) {
            lo -= 1;
        }

        if (durationOf(lo, hi) >= TARGET_DURATION) {
            break;
        }

        if (canGrowAfter) {
            hi += 1;
        }
    }

    while (
        durationOf(lo, hi) < MIN_DURATION &&
        (lo > 0 || hi < transcript.length - 1)
    ) {
        if (lo > 0) {
            lo -= 1;
        } else if (hi < transcript.length - 1) {
            hi += 1;
        } else {
            break;
        }
    }

    let start = Number(transcript[lo].start) || 0;
    let end = Number(transcript[hi].end) || start;

    start = Math.max(0, start);
    end = Math.max(start, end);

    if (Number.isFinite(duration) && duration > 0) {
        start = Math.min(start, duration);
        end = Math.min(end, duration);
    }

    if (end < start) {
        end = start;
    }

    return {
        start: Number(start.toFixed(2)),
        end: Number(end.toFixed(2)),
    };
}

export function excerptFor(transcript, startIdx, endIdx) {
    if (!Array.isArray(transcript) || transcript.length === 0) {
        return "";
    }

    let lo = Math.max(
        0,
        Math.min(Number(startIdx) || 0, transcript.length - 1)
    );

    let hi = Math.max(
        0,
        Math.min(Number(endIdx) || 0, transcript.length - 1)
    );

    if (hi < lo) {
        [lo, hi] = [hi, lo];
    }

    return transcript
        .slice(lo, hi + 1)
        .map((segment) => segment.text)
        .join(" ")
        .trim();
}
